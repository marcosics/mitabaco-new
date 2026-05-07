import csv
import os
import re
import tempfile
from playwright.sync_api import sync_playwright

ZONE_MAP = {
    "": "nacional",
    "Península e Illes Balears": "nacional",
    "Ceuta y Melilla": "ceuta-melilla",
}

def scrape_hacienda():
    all_products = []
    temp_files = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        
        try:
            page.goto(
                "https://www.hacienda.gob.es/es-ES/Areas%20Tematicas/CMTabacos/Paginas/PreciosLabores.aspx",
                wait_until="networkidle",
                timeout=60000
            )
            
            # Accept cookies
            try:
                page.click("#checkbox-cb", timeout=5000)
                page.wait_for_timeout(1000)
            except:
                pass
            
            # Iterate through zones
            for zone_value, zone_slug in ZONE_MAP.items():
                try:
                    # Select zone
                    if zone_value:
                        page.select_option("#zonas", zone_value)
                    else:
                        page.select_option("#zonas", "")
                    
                    # Click "Consultar precios"
                    page.click("#filtrarSin", timeout=10000)
                    page.wait_for_timeout(3000)
                    
                    # Export CSV
                    with page.expect_download(timeout=30000) as download_info:
                        page.click("#exportToCSV", timeout=10000)
                    
                    download = download_info.value
                    
                    # Save to temp file
                    fd, tmp_path = tempfile.mkstemp(suffix=".csv")
                    os.close(fd)
                    download.save_as(tmp_path)
                    temp_files.append((tmp_path, zone_slug))
                    
                except Exception as e:
                    print(f"Error scraping zone '{zone_value}': {e}")
                    continue
            
        except Exception as e:
            print(f"Scrape failed: {e}")
        finally:
            browser.close()
    
    # Parse all downloaded CSVs
    for tmp_path, zone_slug in temp_files:
        products = parse_csv(tmp_path, zone_slug)
        all_products.extend(products)
        try:
            os.remove(tmp_path)
        except:
            pass
    
    if not all_products:
        print("WARNING: No products scraped from hacienda.gob.es")
        return False
    
    # Deduplicate by name + zone
    seen = {}
    for p in all_products:
        key = f"{p['nombre']}_{p['zona']}"
        if key not in seen:
            seen[key] = p
    
    all_products = list(seen.values())
    
    # Write final CSV in frontend format
    with open("tabaco.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["nombre", "tipo", "zona", "precio"])
        writer.writeheader()
        writer.writerows(all_products)
    
    print(f"Saved {len(all_products)} products to tabaco.csv")
    return True

def parse_csv(path, zone_slug):
    products = []
    
    with open(path, "r", encoding="utf-8-sig") as f:
        content = f.read()
    
    lines = content.strip().split("\n")
    
    if len(lines) < 2:
        print(f"Empty CSV for zone {zone_slug}")
        return products
    
    # Detect separator (usually semicolon in Spanish government CSVs)
    separator = ";"
    if ";" not in lines[0] and "," in lines[0]:
        separator = ","
    
    # Parse header to find column positions
    headers = [h.strip().lower() for h in lines[0].split(separator)]
    
    code_idx = None
    name_idx = None
    price_idx = None
    type_idx = None
    
    for idx, h in enumerate(headers):
        if "cód" in h or "cod" in h:
            code_idx = idx
        elif "labor" in h or "marca" in h or "denominación" in h or "denominacion" in h or "nombre" in h or "descripción" in h or "descripcion" in h:
            name_idx = idx
        elif "precio" in h or "pvp" in h or "importe" in h:
            price_idx = idx
        elif "tipo" in h or "labor" in h or "clase" in h or "categoría" in h or "categoria" in h:
            type_idx = idx
    
    # If we couldn't identify columns, use fallback positions
    if name_idx is None:
        # Fallback: second column is name, last is price
        if len(headers) >= 3:
            name_idx = 1
            price_idx = -1
            if code_idx is None:
                code_idx = 0
        elif len(headers) >= 2:
            name_idx = 0
            price_idx = -1
    
    print(f"Zone {zone_slug}: header={headers}, name_idx={name_idx}, price_idx={price_idx}")
    
    # Parse data rows
    for i in range(1, len(lines)):
        line = lines[i].strip()
        if not line:
            continue
        
        cols = line.split(separator)
        
        if name_idx is None or price_idx is None:
            # Last-ditch fallback
            if len(cols) >= 2:
                name = cols[0].strip()
                price = cols[-1].strip().replace(",", ".").replace("€", "")
            else:
                continue
        else:
            name = cols[name_idx].strip() if name_idx < len(cols) else ""
            price = cols[price_idx].strip() if price_idx < len(cols) else ""
            price = price.replace(",", ".").replace("€", "")
        
        # Clean price - extract only numbers and dots
        price = re.sub(r'[^\d.]', '', price)
        
        if not name or not price:
            continue
        
        # Determine labor type from name if type column not found
        labor_type = detect_type(name, cols, type_idx)
        
        products.append({
            "nombre": name,
            "tipo": labor_type,
            "zona": zone_slug,
            "precio": price
        })
    
    print(f"Zone {zone_slug}: parsed {len(products)} products")
    return products

def detect_type(name, cols, type_idx):
    name_lower = name.lower()
    
    # If there's a type column, try to use it
    if type_idx is not None and type_idx < len(cols):
        type_val = cols[type_idx].strip().lower()
        if "cigarrillo" in type_val:
            return "cigarrillos"
        elif "cigarro" in type_val or "puro" in type_val:
            return "puros"
        elif "picadura" in type_val and "liar" in type_val:
            return "tabaco-liar"
        elif "pipa" in type_val:
            return "tabaco-pipa"
        elif "mascar" in type_val:
            return "tabaco-mascar"
        elif "aspirar" in type_val:
            return "tabaco-aspirar"
    
    # Fallback: infer from name
    if any(kw in name_lower for kw in ["cigarrillo", "cigarr"]):
        return "cigarrillos"
    elif any(kw in name_lower for kw in ["puro", "cigarro"]):
        return "puros"
    elif any(kw in name_lower for kw in ["liar", "picadura", "shag", "ambarella", "bali"]):
        return "tabaco-liar"
    elif "pipa" in name_lower:
        return "tabaco-pipa"
    elif "mascar" in name_lower:
        return "tabaco-mascar"
    elif "aspirar" in name_lower:
        return "tabaco-aspirar"
    else:
        return "otros"

if __name__ == "__main__":
    success = scrape_hacienda()
    if not success:
        print("Falling back to empty CSV - check scraper logs.")

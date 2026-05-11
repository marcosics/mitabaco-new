import csv
import os
import re
import tempfile
import json
from playwright.sync_api import sync_playwright

ZONE_MAP = {
    "": "nacional",
    "Península e Illes Balears": "nacional",
    "Ceuta y Melilla": "ceuta-melilla",
}

def scrape_hacienda():
    old_prices = {}
    if os.path.exists("tabaco.csv"):
        old_prices = read_old_prices("tabaco.csv")

    all_products = []
    temp_files = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        try:
            page.goto(
                "https://www.hacienda.gob.es/es-ES/Areas%20Tematicas/CMTabacos/Paginas/PreciosLabores.aspx",
                wait_until="networkidle", timeout=60000
            )
            try:
                page.click("#checkbox-cb", timeout=5000)
                page.wait_for_timeout(1000)
            except:
                pass

            for zone_value, zone_slug in ZONE_MAP.items():
                try:
                    if zone_value:
                        page.select_option("#zonas", zone_value)
                    else:
                        page.select_option("#zonas", "")
                    page.click("#filtrarSin", timeout=10000)
                    page.wait_for_timeout(3000)
                    with page.expect_download(timeout=30000) as di:
                        page.click("#exportToCSV", timeout=10000)
                    dl = di.value
                    fd, tmp = tempfile.mkstemp(suffix=".csv")
                    os.close(fd)
                    dl.save_as(tmp)
                    temp_files.append((tmp, zone_slug))
                except Exception as e:
                    print(f"Zone {zone_value} error: {e}")

        except Exception as e:
            print(f"Scrape failed: {e}")
        finally:
            browser.close()

    for tmp, zone in temp_files:
        prods = parse_csv(tmp, zone)
        all_products.extend(prods)
        try: os.remove(tmp)
        except: pass

    if not all_products:
        print("No products scraped")
        return False

    seen = {}
    for p in all_products:
        key = f"{p['nombre']}_{p['zona']}"
        if key not in seen:
            seen[key] = p

    all_products = list(seen.values())

    # Detect price changes for favorites
    changes = []
    for p in all_products:
        old = old_prices.get(p['nombre'])
        if old and old != p['precio']:
            changes.append({"nombre": p['nombre'], "old": old, "new": p['precio']})

    if changes:
        os.makedirs("data", exist_ok=True)
        with open("data/price-changes.json", "w", encoding="utf-8") as f:
            json.dump(changes, f, ensure_ascii=False, indent=2)
        print(f"Price changes detected: {len(changes)}")

    with open("tabaco.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["nombre", "tipo", "zona", "precio"])
        w.writeheader()
        w.writerows(all_products)

    print(f"Saved {len(all_products)} products")
    return True

def read_old_prices(path):
    prices = {}
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    lines = text.strip().split("\n")
    if len(lines) < 2: return prices
    for i in range(1, len(lines)):
        parts = []; cur = ""; inQ = False
        for ch in lines[i]:
            if ch == '"': inQ = not inQ; continue
            if ch == "," and not inQ: parts.append(cur.strip()); cur = ""; continue
            cur += ch
        parts.append(cur.strip())
        if len(parts) < 4: continue
        name = re.sub(r'^#NO NAME\s*', '', parts[0]).strip()
        if name:
            prices[name] = re.sub(r'[^\d.]', '', parts[3].replace(",", "."))
    return prices

def parse_csv(path, zone_slug):
    products = []
    with open(path, "r", encoding="utf-8-sig") as f:
        content = f.read()
    lines = content.strip().split("\n")
    if len(lines) < 2: return products

    sep = ";"
    if ";" not in lines[0] and "," in lines[0]: sep = ","

    hdrs = [h.strip().lower() for h in lines[0].split(sep)]
    name_idx = price_idx = type_idx = None

    for i, h in enumerate(hdrs):
        if "marca" in h or "descripción" in h or "descripcion" in h: name_idx = i
        elif any(k in h for k in ["expendeduría", "expendeduria", "euros", "precio", "pvp", "recargo"]):
            if price_idx is None: price_idx = i
        elif any(k in h for k in ["tipo", "labor", "clase"]): type_idx = i

    if name_idx is None:
        name_idx = 0
    if price_idx is None:
        price_idx = 1 if len(hdrs) >= 2 else -1

    for i in range(1, len(lines)):
        line = lines[i].strip()
        if not line: continue
        cols = line.split(sep)
        if name_idx is not None and name_idx < len(cols):
            name = cols[name_idx].strip()
        else:
            name = cols[0].strip() if cols else ""

        if price_idx is not None and price_idx < len(cols):
            price = cols[price_idx].strip().replace(",", ".").replace("€", "")
        else:
            price = ""
            for c in reversed(cols[1:]):
                p = re.sub(r'[^\d.]', '', c.replace(",", "."))
                if p: price = p; break

        price = re.sub(r'[^\d.]', '', price)
        if not name or not price: continue
        name = re.sub(r'^#NO NAME\s*', '', name).strip()

        products.append({
            "nombre": name,
            "tipo": detect_type(name),
            "zona": zone_slug,
            "precio": price
        })
    return products

def detect_type(name):
    n = name.lower()
    if re.search(r'\(\d+\s?g\)', n):
        return "tabaco-liar" if "pipa" not in n else "tabaco-pipa"
    if any(k in n for k in ["cigarrillo", "cigarr", "cig."]):
        return "cigarrillos"
    if any(k in n for k in ["puro", "cigarro", "cigar"]):
        return "puros"
    if any(k in n for k in ["liar", "picadura", "shag", "ambarella", "bali", "rolling", "drum"]):
        return "tabaco-liar"
    if any(k in n for k in ["pipa", "pipe"]):
        return "tabaco-pipa"
    if any(k in n for k in ["mascar", "chewing", "snus"]):
        return "tabaco-mascar"
    if any(k in n for k in ["aspirar", "snuff", "rapé", "rape"]):
        return "tabaco-aspirar"
    if re.search(r'\(\d{2}\)', name):
        return "cigarrillos"
    return "otros"

if __name__ == "__main__":
    success = scrape_hacienda()
    if not success:
        print("Scraper failed")

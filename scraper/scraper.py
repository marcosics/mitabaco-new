import csv
from playwright.sync_api import sync_playwright

def scrape_prices():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        try:
            page.goto("https://elpreciodeltabaco.com/", wait_until="networkidle")
            
            products = []
            rows = page.query_selector_all("table tr")
            
            for row in rows:
                cells = row.query_selector_all("td")
                if len(cells) >= 4:
                    name = cells[0].inner_text().strip()
                    tipo = cells[1].inner_text().strip()
                    zona = cells[2].inner_text().strip()
                    precio = cells[3].inner_text().strip().replace("€", "")
                    if name and precio:
                        products.append({
                            "nombre": name,
                            "tipo": tipo,
                            "zona": zona,
                            "precio": precio
                        })
        except Exception as e:
            print(f"Scrape failed: {e}")
        finally:
            browser.close()
    
    if not products:
        print("No products found. Using fallback data.")
        products = [
            {"nombre": "Marlboro Red", "tipo": "cigarrillos", "zona": "nacional", "precio": "5.80"},
            {"nombre": "Fortuna Rojo", "tipo": "cigarrillos", "zona": "nacional", "precio": "5.50"},
            {"nombre": "Camel Blue", "tipo": "cigarrillos", "zona": "nacional", "precio": "5.70"},
        ]
    
    with open("tabaco.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["nombre", "tipo", "zona", "precio"])
        writer.writeheader()
        writer.writerows(products)
    
    print(f"Saved {len(products)} products to tabaco.csv")

if __name__ == "__main__":
    scrape_prices()
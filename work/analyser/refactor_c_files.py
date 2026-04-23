import os
import json
import sys
import requests

# LocalAI-Endpunkt
LOCALAI_URL = "https://pegenaut.pegenau.de/v1/chat/completions"  # Passe ggf. den Port an

# Funktion zum Aufrufen von LocalAI mit dem aktuellen Code und Namens-Mapping
def refactor_code_with_context(code, name_map):
    prompt = f"""
Hier ist eine C-Datei aus einem Projekt. Benenne alle Funktionen und globalen Variablen sinnvoll um. Beachte die vorherigen Namensänderungen.

Aktuelle Namenszuordnung:
```json
{name_map}
```

Datei:
```c
{code}
```

Gib mir nur den neuen C-Code und ein aktualisiertes JSON mit den neuen Namenszuordnungen (alt -> neu).
"""

    payload = {
        "model": "deepseek-r1-distill-qwen-1.5b",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3
    }

    try:
        response = requests.post(LOCALAI_URL, json=payload)
        response.raise_for_status()
        result = response.json()
        content = result['choices'][0]['message']['content']

        # Versuche das JSON-Mapping vom restlichen Code zu trennen
        try:
            code_part, json_part = content.strip().rsplit("```", 1)[0].rsplit("```", 1)
            new_code = code_part.strip()
            new_name_map = json.loads(json_part.strip())
        except Exception as e:
            print("Fehler beim Parsen der Antwort:", e)
            new_code = content
            new_name_map = {}

        return new_code, new_name_map

    except Exception as e:
        print("Fehler beim Aufruf von LocalAI:", e)
        return code, name_map

def load_file(file_path):
    with open(file_path, "r") as file:
        return file.read()

def load_all_files(directory):
    return sorted([f for f in os.listdir(directory) if f.endswith('.c')])

def save_refactored_code(filename, code):
    with open(filename, "w") as file:
        file.write(code)

def process_files(directory):
    name_map = {}
    files = load_all_files(directory)

    if os.path.exists("name_map.json"):
        with open("name_map.json", "r") as map_file:
            name_map = json.load(map_file)
        print("Aktuelles Namens-Mapping geladen.")

    for file in files:
        file_path = os.path.join(directory, file)
        print(f"Verarbeite Datei: {file_path}")

        code = load_file(file_path)
        refactored_code, updated_name_map = refactor_code_with_context(code, name_map)

        save_refactored_code(file_path, refactored_code)
        name_map.update(updated_name_map)

        with open("name_map.json", "w") as map_file:
            json.dump(name_map, map_file, indent=2)

        print(f"✔️ Datei überarbeitet und gespeichert: {file_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python refactor_c_files.py <directory>")
        sys.exit(1)

    directory = sys.argv[1]
    if not os.path.exists(directory):
        print(f"Ordner '{directory}' existiert nicht.")
        sys.exit(1)

    process_files(directory)
    print("✔️ Alle Dateien erfolgreich überarbeitet.")

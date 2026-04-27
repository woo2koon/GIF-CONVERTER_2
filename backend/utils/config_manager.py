import os
import json

CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "config.json")
DEFAULT_SAVE_DIR = os.path.join(os.path.expanduser("~"), "Downloads")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {"save_dir": DEFAULT_SAVE_DIR}
    return {"save_dir": DEFAULT_SAVE_DIR}

def save_config(config):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4, ensure_ascii=False)

app_config = load_config()

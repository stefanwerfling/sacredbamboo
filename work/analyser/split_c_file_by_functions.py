import re
import os
import sys

def split_c_file(filename):
    with open(filename, "r") as f:
        code = f.read()

    pattern = r'([a-zA-Z_][\w]*\s+[\w_]+\s*\([^)]*\)\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})'
    functions = re.findall(pattern, code, re.DOTALL)

    output_dir = f"{filename}_split"
    os.makedirs(output_dir, exist_ok=True)

    for i, func in enumerate(functions):
        func_name_match = re.search(r'(\w+)\s*\(', func)
        func_name = func_name_match.group(1) if func_name_match else f"func_{i}"
        with open(os.path.join(output_dir, f"{i:02d}_{func_name}.c"), "w") as out:
            out.write(func)

    print(f"✔️ {len(functions)} Funktionen gespeichert in: {output_dir}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python split_c_file_by_functions.py file.c")
        sys.exit(1)
    split_c_file(sys.argv[1])
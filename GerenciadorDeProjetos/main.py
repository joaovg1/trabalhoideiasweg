from __future__ import annotations
import argparse
import json
from datetime import datetime
from pathlib import Path
from gerenciador_de_projetos import generate_project_plan, format_project_plan


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gerenciador de projetos com orçamento e materiais para ideias industriais."
    )
    parser.add_argument(
        "idea",
        nargs="*",
        help="Descrição da ideia do projeto.",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="",
        help="Nome do arquivo de saída JSON com o orçamento e materiais. Se não fornecido, o nome será gerado automaticamente.",
    )
    parser.add_argument(
        "--output-dir",
        "-d",
        default="orcamentos",
        help="Pasta de saída para os orçamentos.",
    )
    parser.add_argument(
        "--language",
        "-l",
        choices=["pt", "en"],
        default="pt",
        help="Idioma de saída.",
    )
    return parser.parse_args()


def _slugify_filename(value: str) -> str:
    sanitized = "".join(
        char if char.isalnum() or char in ("-", "_") else "_" for char in value.lower()
    )
    sanitized = sanitized.strip("_-")
    return sanitized or "orcamento"


def _generate_output_path(output_dir: Path, output_name: str, project_name: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    if output_name:
        filename = output_name if output_name.endswith(".json") else f"{output_name}.json"
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        slug = _slugify_filename(project_name)
        filename = f"{slug}_{timestamp}.json"

    return output_dir / filename


def main() -> None:
    args = parse_args()
    idea_text = " ".join(args.idea).strip()
    if not idea_text:
        idea_text = input("Digite a ideia do projeto: ").strip()

    if not idea_text:
        raise SystemExit("É necessário informar a ideia do projeto.")

    plan = generate_project_plan(idea_text)
    output_dir = Path(args.output_dir)
    output_path = _generate_output_path(output_dir, args.output, plan["project_name"])
    output_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    print(format_project_plan(plan, language=args.language))
    print(f"\nResultado salvo em: {output_path.resolve()}")


if __name__ == "__main__":
    main()

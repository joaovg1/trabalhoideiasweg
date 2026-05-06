from __future__ import annotations
import argparse
import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

import openai
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


def _extract_json_object(text: str) -> str:
    import re
    match = re.search(r"(\{[\s\S]*\})", text)
    return match.group(1) if match else text


def _generate_project_plan_with_chatgpt(idea: str) -> dict[str, object]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada no ambiente.")

    openai.api_key = api_key
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {
                "role": "system",
                "content": (
                    "Você é um assistente especialista em projetos industriais. "
                    "Transforme a ideia do usuário em um plano de projeto completo e muito detalhado. "
                    "Inclua uma descrição rica, categorias específicas, lista completa de materiais e serviços com nomes, "
                    "quantidades, unidades, preços unitários e custos totais. Calcule o orçamento total, custos de planejamento, "
                    "custos de materiais e a duração estimada. Responda apenas com JSON válido sem explicações extras."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Ideia do projeto: {idea}\n\n"
                    "Responda apenas com JSON válido no formato:\n"
                    "{\n"
                    "  \"idea\": \"...\",\n"
                    "  \"project_name\": \"...\",\n"
                    "  \"description\": \"...\",\n"
                    "  \"categories\": [\"...\", \"...\"],\n"
                    "  \"materials\": [\n"
                    "    {\"item\": \"Nome do material ou serviço\", \"category\": \"Categoria do item\", \"quantity\": 1, \"unit\": \"unidade\", \"unit_cost\": 0.0, \"total_cost\": 0.0}\n"
                    "  ],\n"
                    "  \"budget\": 1234.56,\n"
                    "  \"planning_cost_total\": 123.45,\n"
                    "  \"materials_cost_total\": 1111.11,\n"
                    "  \"estimated_duration\": \"...\"\n"
                    "}"
                ),
            },
        ],
        temperature=0.0,
        max_tokens=900,
    )

    text = response.choices[0].message.content
    plan = json.loads(_extract_json_object(text))

    if "idea" not in plan:
        plan["idea"] = idea
    return plan


def main() -> None:
    args = parse_args()
    idea_text = " ".join(args.idea).strip()
    if not idea_text:
        idea_text = input("Digite a ideia do projeto: ").strip()

    if not idea_text:
        raise SystemExit("É necessário informar a ideia do projeto.")

    plan = None
    if os.getenv("OPENAI_API_KEY"):
        try:
            plan = _generate_project_plan_with_chatgpt(idea_text)
        except Exception as exc:
            print(f"[AVISO] Falha ao gerar com ChatGPT: {exc}. Usando gerador local.")

    if plan is None:
        plan = generate_project_plan(idea_text)

    output_dir = Path(args.output_dir)
    output_path = _generate_output_path(output_dir, args.output, plan["project_name"])
    output_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")

    # Save to database
    db_path = Path(__file__).parent.parent / "backend" / "weg_suggestions.db"
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO budgets (idea, project_name, description, categories, materials, budget, planning_cost_total, materials_cost_total, estimated_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            plan["idea"],
            plan["project_name"],
            plan["description"],
            json.dumps(plan["categories"]),
            json.dumps(plan["materials"]),
            plan["budget"],
            plan["planning_cost_total"],
            plan["materials_cost_total"],
            plan["estimated_duration"]
        ))
        conn.commit()
        conn.close()
        print("Orçamento salvo no banco de dados.")
    except Exception as e:
        print(f"Erro ao salvar no banco de dados: {e}")

    print(format_project_plan(plan, language=args.language))
    print(f"\nResultado salvo em: {output_path.resolve()}")


if __name__ == "__main__":
    main()

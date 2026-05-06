from __future__ import annotations
import json
import os
import re
from typing import Any

try:
    import openai
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False

CATEGORY_KEYWORDS = {
    "Desenvolvimento de software": [
        "aplicativo",
        "app",
        "mobile",
        "web",
        "software",
        "sistema",
        "site",
        "plataforma",
    ],
    "Eletrônica e hardware": [
        "arduino",
        "raspberry",
        "sensor",
        "eletrônico",
        "hardware",
        "robô",
        "robot",
        "iot",
    ],
    "Design e identidade visual": [
        "design",
        "logo",
        "marca",
        "branding",
        "ux",
        "ui",
        "identidade",
    ],
    "Móveis e carpintaria": [
        "armário",
        "armario",
        "marcenaria",
        "carpintaria",
        "móvel",
        "movel",
        "prateleira",
        "estante",
        "mobiliário",
        "mobiliario",
        "madeira",
        "pinus",
        "mdf",
        "compensado",
    ],
    "Manufatura e fabricação": [
        "fábrica",
        "fabrica",
        "manufatura",
        "manufaturado",
        "indústria",
        "industria",
        "linha de montagem",
        "assemblagem",
        "montagem",
        "massa",
        "produção em massa",
        "producao em massa",
        "forja",
    ],
    "Construção e reforma": [
        "construção",
        "construcao",
        "obra",
        "reforma",
        "casa",
        "quarto",
        "jardim",
        "piso",
    ],
    "Marketing e divulgação": [
        "marketing",
        "campanha",
        "anúncio",
        "anuncio",
        "promoção",
        "promocao",
        "social",
        "redes sociais",
    ],
    "Educação e treinamento": [
        "curso",
        "aula",
        "educação",
        "educacao",
        "treinamento",
        "tutorial",
        "conteúdo",
    ],
    "Melhoria de processo industrial": [
        "processo",
        "eficiência",
        "eficiencia",
        "produção",
        "producao",
        "fluxo",
        "linha de produção",
        "linha de producao",
        "layout",
        "operacional",
        "capacidade",
        "fábrica",
        "fabricar",
        "fabrica",
    ],
    "Automação industrial": [
        "automação",
        "automacao",
        "plc",
        "clp",
        "robô",
        "robot",
        "sensores",
        "controlador",
        "movimentação",
        "movimentacao",
        "esteira",
        "automação industrial",
    ],
    "Manutenção e equipamentos": [
        "manutenção",
        "manutencao",
        "equipamento",
        "máquina",
        "maquina",
        "peça",
        "peca",
        "ferramenta",
        "calibração",
        "calibracao",
        "inspeção",
        "inspecao",
        "servo",
    ],
    "Qualidade e segurança": [
        "segurança",
        "seguranca",
        "qualidade",
        "iso",
        "norma",
        "compliance",
        "ehs",
        "safety",
        "segurança do trabalho",
    ],
    "Logística e produção": [
        "logística",
        "logistica",
        "estoque",
        "armazenagem",
        "produção",
        "producao",
        "transporte",
        "inventário",
        "inventario",
        "expedição",
        "recebimento",
    ],
}

CATEGORY_MATERIALS = {
    "Desenvolvimento de software": [
        {
            "item": "Horas de desenvolvimento",
            "category": "Desenvolvimento de software",
            "quantity": 80,
            "unit": "horas",
            "unit_cost": 120.0,
        },
        {
            "item": "Serviço de hospedagem",
            "category": "Desenvolvimento de software",
            "quantity": 12,
            "unit": "meses",
            "unit_cost": 40.0,
        },
    ],
    "Eletrônica e hardware": [
        {
            "item": "Placa de desenvolvimento",
            "category": "Eletrônica e hardware",
            "quantity": 1,
            "unit": "unidade",
            "unit_cost": 120.0,
        },
        {
            "item": "Sensores e módulos",
            "category": "Eletrônica e hardware",
            "quantity": 3,
            "unit": "unidades",
            "unit_cost": 35.0,
        },
        {
            "item": "Protoboard e fios",
            "category": "Eletrônica e hardware",
            "quantity": 1,
            "unit": "kit",
            "unit_cost": 35.0,
        },
    ],
    "Design e identidade visual": [
        {
            "item": "Projeto visual UX/UI",
            "category": "Design e identidade visual",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 420.0,
        },
        {
            "item": "Imagens e banco de ativos",
            "category": "Design e identidade visual",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 120.0,
        },
    ],
    "Móveis e carpintaria": [
        {
            "item": "Pranchas de madeira MDF/compensado",
            "category": "Móveis e carpintaria",
            "quantity": 8,
            "unit": "unidades",
            "unit_cost": 95.0,
        },
        {
            "item": "Prego e parafuso",
            "category": "Móveis e carpintaria",
            "quantity": 100,
            "unit": "unidades",
            "unit_cost": 0.55,
        },
        {
            "item": "Dobradiças metálicas",
            "category": "Móveis e carpintaria",
            "quantity": 4,
            "unit": "unidades",
            "unit_cost": 18.0,
        },
        {
            "item": "Cola para madeira",
            "category": "Móveis e carpintaria",
            "quantity": 1,
            "unit": "frasco",
            "unit_cost": 40.0,
        },
        {
            "item": "Tinta/verniz e lixa",
            "category": "Móveis e carpintaria",
            "quantity": 1,
            "unit": "kit",
            "unit_cost": 90.0,
        },
    ],
    "Manufatura e fabricação": [
        {
            "item": "Folhas metálicas e chapas",
            "category": "Manufatura e fabricação",
            "quantity": 10,
            "unit": "unidades",
            "unit_cost": 220.0,
        },
        {
            "item": "Componentes de montagem e fixação",
            "category": "Manufatura e fabricação",
            "quantity": 150,
            "unit": "unidades",
            "unit_cost": 2.5,
        },
        {
            "item": "Tubos e conexões industriais",
            "category": "Manufatura e fabricação",
            "quantity": 12,
            "unit": "unidades",
            "unit_cost": 65.0,
        },
        {
            "item": "Serviço de usinagem / corte industrial",
            "category": "Manufatura e fabricação",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 1800.0,
        },
        {
            "item": "EPI e segurança operacional",
            "category": "Manufatura e fabricação",
            "quantity": 1,
            "unit": "kit",
            "unit_cost": 650.0,
        },
    ],
    "Construção e reforma": [
        {
            "item": "Materiais de construção",
            "category": "Construção e reforma",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 1500.0,
        },
        {
            "item": "Mão de obra especializada",
            "category": "Construção e reforma",
            "quantity": 1,
            "unit": "serviço",
            "unit_cost": 2500.0,
        },
    ],
    "Marketing e divulgação": [
        {
            "item": "Campanha digital",
            "category": "Marketing e divulgação",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 900.0,
        },
        {
            "item": "Investimento em anúncios online",
            "category": "Marketing e divulgação",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 600.0,
        },
    ],
    "Educação e treinamento": [
        {
            "item": "Produção de conteúdo do curso",
            "category": "Educação e treinamento",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 1100.0,
        },
        {
            "item": "Plataforma de educação",
            "category": "Educação e treinamento",
            "quantity": 6,
            "unit": "meses",
            "unit_cost": 85.0,
        },
    ],
    "Melhoria de processo industrial": [
        {
            "item": "Mapeamento e otimização de processos",
            "category": "Melhoria de processo industrial",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 1800.0,
        },
        {
            "item": "Consultoria de eficiência industrial",
            "category": "Melhoria de processo industrial",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 1600.0,
        },
    ],
    "Automação industrial": [
        {
            "item": "Controlador lógico programável (PLC)",
            "category": "Automação industrial",
            "quantity": 1,
            "unit": "unidade",
            "unit_cost": 2200.0,
        },
        {
            "item": "Sensores industriais e cabos",
            "category": "Automação industrial",
            "quantity": 5,
            "unit": "unidades",
            "unit_cost": 85.0,
        },
        {
            "item": "Programação e integração de sistemas",
            "category": "Automação industrial",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 1900.0,
        },
    ],
    "Manutenção e equipamentos": [
        {
            "item": "Peças de reposição e componentes",
            "category": "Manutenção e equipamentos",
            "quantity": 1,
            "unit": "kit",
            "unit_cost": 900.0,
        },
        {
            "item": "Ferramentas e calibração",
            "category": "Manutenção e equipamentos",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 1300.0,
        },
        {
            "item": "Inspeção técnica preventiva",
            "category": "Manutenção e equipamentos",
            "quantity": 1,
            "unit": "serviço",
            "unit_cost": 1100.0,
        },
    ],
    "Qualidade e segurança": [
        {
            "item": "Auditoria de qualidade e normas",
            "category": "Qualidade e segurança",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 1400.0,
        },
        {
            "item": "EPI e treinamentos de segurança",
            "category": "Qualidade e segurança",
            "quantity": 1,
            "unit": "pacote",
            "unit_cost": 1200.0,
        },
    ],
}

COMPLEX_PROJECT_KEYWORDS = [
    "complexo",
    "complexidade",
    "grande risco",
    "alto risco",
    "risco",
    "crítico",
    "critico",
    "implementação",
    "implantação",
    "implantacao",
    "integração",
    "integracao",
    "expansão",
    "expansao",
    "redefinição",
    "redefinicao",
    "inovação",
    "inovacao",
    "transformação",
    "transformacao",
]

BASIC_PLANNING_TASK = {
    "item": "Análise rápida de viabilidade",
    "category": "Planejamento",
    "quantity": 1,
    "unit": "pacote",
    "unit_cost": 250.0,
}

ADVANCED_PLANNING_TASKS = [
    {
        "item": "Gerenciamento de projeto",
        "category": "Planejamento",
        "quantity": 1,
        "unit": "pacote",
        "unit_cost": 650.0,
    },
]


def _normalize_text(text: str) -> str:
    return re.sub(r"[^\w\s]", " ", text.lower(), flags=re.UNICODE)


def _extract_json_object(text: str) -> str:
    match = re.search(r"(\{[\s\S]*\})", text)
    return match.group(1) if match else text


def _to_number(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = re.sub(r"[^0-9,.-]", "", value)
        cleaned = cleaned.replace(".", "").replace(",", ".") if cleaned.count(",") == 1 and cleaned.count(".") == 0 else cleaned
        try:
            return float(cleaned)
        except ValueError:
            return 0.0
    return 0.0


def _normalize_openai_plan(plan: dict[str, Any], idea: str) -> dict[str, Any]:
    categories = plan.get("categories") or []
    if isinstance(categories, str):
        categories = [categories]
    if not isinstance(categories, list):
        categories = []

    materials = plan.get("materials") or []
    if not isinstance(materials, list):
        materials = []

    normalized_materials: list[dict[str, Any]] = []
    for item in materials:
        if not isinstance(item, dict):
            continue
        quantity = _to_number(item.get("quantity", 1))
        unit_cost = _to_number(item.get("unit_cost", 0.0))
        total_cost = _to_number(item.get("total_cost", quantity * unit_cost))
        if total_cost == 0.0:
            total_cost = round(quantity * unit_cost, 2)

        normalized_materials.append({
            "item": str(item.get("item", "")),
            "category": str(item.get("category", "")),
            "quantity": quantity,
            "unit": str(item.get("unit", "")),
            "unit_cost": round(unit_cost, 2),
            "total_cost": round(total_cost, 2),
        })

    budget = _to_number(plan.get("budget", sum(item["total_cost"] for item in normalized_materials)))
    planning_cost_total = _to_number(plan.get("planning_cost_total", sum(item["total_cost"] for item in normalized_materials if item["category"].lower() == "planejamento")))
    materials_cost_total = _to_number(plan.get("materials_cost_total", budget - planning_cost_total))

    return {
        "idea": idea,
        "project_name": str(plan.get("project_name") or _generate_title(idea)),
        "description": str(plan.get("description") or f"Plano de projeto para '{idea}' com foco em {', '.join(categories)}."),
        "categories": [str(category) for category in categories],
        "materials": normalized_materials,
        "budget": round(budget, 2),
        "planning_cost_total": round(planning_cost_total, 2),
        "materials_cost_total": round(materials_cost_total, 2),
        "estimated_duration": str(plan.get("estimated_duration") or _estimate_duration(categories)),
    }


def _get_chatgpt_project_plan(idea: str) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada no ambiente.")
    if not _OPENAI_AVAILABLE:
        raise RuntimeError("Dependência openai não instalada. Instale com 'pip install openai'.")

    openai.api_key = api_key
    messages = [
        {
            "role": "system",
            "content": (
                "Você é um assistente que transforma uma ideia de projeto em um plano completo com orçamento, "
                "lista de materiais/serviços e duração estimada. Retorne apenas JSON válido sem explicações "
                "adicionais."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Ideia do projeto: {idea}\n\n"
                "Responda apenas com JSON válido no formato:\n"
                "{\n"
                "  \"project_name\": \"...\",\n"
                "  \"description\": \"...\",\n"
                "  \"categories\": [\"...\", \"...\"],\n"
                "  \"materials\": [\n"
                "    {\"item\": \"...\", \"category\": \"...\", \"quantity\": 1, \"unit\": \"...\", \"unit_cost\": 0.0, \"total_cost\": 0.0}\n"
                "  ],\n"
                "  \"budget\": 1234.56,\n"
                "  \"planning_cost_total\": 123.45,\n"
                "  \"materials_cost_total\": 1111.11,\n"
                "  \"estimated_duration\": \"...\"\n"
                "}"
            ),
        },
    ]

    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=messages,
        temperature=0.0,
        max_tokens=800,
    )

    text = response.choices[0].message.content
    plan = json.loads(_extract_json_object(text))
    return _normalize_openai_plan(plan, idea)


def _detect_categories(idea: str) -> list[str]:
    cleaned = _normalize_text(idea)
    categories: list[str] = []

    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in cleaned:
                categories.append(category)
                break

    if not categories:
        categories = ["Melhoria de processo industrial"]

    return categories


def _generate_title(idea: str) -> str:
    words = idea.strip().split()
    if len(words) > 6:
        return f"{words[0].capitalize()} {words[1].capitalize()} {words[2].capitalize()}..."
    return idea.capitalize()


def _is_complex_project(idea: str, categories: list[str]) -> bool:
    cleaned = _normalize_text(idea)
    return any(keyword in cleaned for keyword in COMPLEX_PROJECT_KEYWORDS)


def _estimate_duration(categories: list[str]) -> str:
    base_days = 10
    multiplier = 1 + 0.5 * (len(categories) - 1)
    return f"{int(base_days * multiplier)} dias úteis"


def _build_materials(idea: str, categories: list[str]) -> list[dict[str, Any]]:
    complex_project = _is_complex_project(idea, categories)
    materials: list[dict[str, Any]] = [BASIC_PLANNING_TASK]

    if complex_project:
        materials.extend(ADVANCED_PLANNING_TASKS)

    for category in categories:
        if category == "Melhoria de processo industrial" and not complex_project:
            continue
        entries = CATEGORY_MATERIALS.get(category)
        if entries:
            materials.extend(entries)

    unique_materials: dict[str, dict[str, Any]] = {}
    for item in materials:
        key = f"{item['item']}|{item['category']}"
        if key in unique_materials:
            unique_materials[key]["quantity"] += item["quantity"]
        else:
            unique_materials[key] = item.copy()

    result: list[dict[str, Any]] = []
    for item in unique_materials.values():
        item["total_cost"] = item["quantity"] * item["unit_cost"]
        result.append(item)

    return result


def generate_project_plan(idea: str) -> dict[str, Any]:
    if os.getenv("OPENAI_API_KEY") and _OPENAI_AVAILABLE:
        try:
            return _get_chatgpt_project_plan(idea)
        except Exception as exc:
            print(f"[AVISO] Falha ao gerar projeto com ChatGPT: {exc}. Usando gerador local.")

    categories = _detect_categories(idea)
    materials = _build_materials(idea, categories)
    budget = sum(item["total_cost"] for item in materials)
    planning_cost = sum(item["total_cost"] for item in materials if item["category"] == "Planejamento")
    material_cost = budget - planning_cost

    return {
        "idea": idea,
        "project_name": _generate_title(idea),
        "description": (
            f"Plano de projeto para '{idea}' com foco em {', '.join(categories)}."
        ),
        "categories": categories,
        "materials": materials,
        "budget": round(budget, 2),
        "planning_cost_total": round(planning_cost, 2),
        "materials_cost_total": round(material_cost, 2),
        "estimated_duration": _estimate_duration(categories),
    }


def format_project_plan(plan: dict[str, Any], language: str = "pt") -> str:
    if language == "en":
        lines = [
            f"Project: {plan['project_name']}",
            f"Description: {plan['description']}",
            f"Estimated duration: {plan['estimated_duration']}",
            f"Budget total: R$ {plan['budget']:.2f}",
            f"Planning cost: R$ {plan['planning_cost_total']:.2f}",
            f"Materials and services cost: R$ {plan['materials_cost_total']:.2f}",
            "Materials and services:",
        ]
    else:
        lines = [
            f"Projeto: {plan['project_name']}",
            f"Descrição: {plan['description']}",
            f"Duração estimada: {plan['estimated_duration']}",
            f"Orçamento total: R$ {plan['budget']:.2f}",
            f"Custo de planejamento: R$ {plan['planning_cost_total']:.2f}",
            f"Custo de materiais e serviços: R$ {plan['materials_cost_total']:.2f}",
            "Materiais e serviços:",
        ]

    for material in plan["materials"]:
        lines.append(
            f"- {material['item']} ({material['category']}): {material['quantity']} {material['unit']} x R$ {material['unit_cost']:.2f} = R$ {material['total_cost']:.2f}"
        )

    return "\n".join(lines)

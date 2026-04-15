from gerenciador_de_projetos.planner import generate_project_plan


def test_generate_project_plan_software_idea() -> None:
    idea = "Aplicativo mobile para agendamento de serviços de jardinagem"
    plan = generate_project_plan(idea)

    assert plan["idea"] == idea
    assert plan["budget"] > 0
    assert plan["planning_cost_total"] > 0
    assert plan["materials_cost_total"] > 0
    assert any(
        material["category"] == "Desenvolvimento de software" for material in plan["materials"]
    )
    assert plan["materials"]


def test_generate_project_plan_armario_idea() -> None:
    idea = "Montar um armário do zero com todos os materiais necessários"
    plan = generate_project_plan(idea)

    assert plan["idea"] == idea
    assert plan["budget"] > 0
    assert any(
        material["category"] == "Móveis e carpintaria" for material in plan["materials"]
    )
    assert any(
        material["item"] == "Pranchas de madeira MDF/compensado" for material in plan["materials"]
    )
    assert any(
        material["item"] == "Prego e parafuso" for material in plan["materials"]
    )
    assert plan["materials_cost_total"] > 0
    assert plan["planning_cost_total"] > 0


def test_generate_project_plan_factory_project() -> None:
    idea = "Criar linha de montagem para fabricação de peças metálicas na fábrica"
    plan = generate_project_plan(idea)

    assert plan["idea"] == idea
    assert plan["budget"] > 0
    assert any(
        material["category"] == "Manufatura e fabricação" for material in plan["materials"]
    )
    assert any(
        material["item"] == "Folhas metálicas e chapas" for material in plan["materials"]
    )
    assert plan["materials_cost_total"] > 0
    assert plan["planning_cost_total"] > 0

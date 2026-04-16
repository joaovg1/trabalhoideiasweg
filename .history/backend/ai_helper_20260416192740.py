import json
import sys
from pathlib import Path

# Add workspace root to Python path so GerenciadorDeProjetos can be imported.
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

try:
    from GerenciadorDeProjetos import generate_project_plan
except Exception as exc:
    print(json.dumps({'error': f'Unable to import GerenciadorDeProjetos: {exc}'}), file=sys.stderr)
    raise


def main() -> None:
    data = json.load(sys.stdin)
    suggestion = data.get('suggestion', '')
    if not suggestion:
        print(json.dumps({'error': 'Sugestão vazia'}))
        return

    plan = generate_project_plan(suggestion)
    output = {
        'description': plan.get('description'),
        'project_name': plan.get('project_name'),
        'categories': plan.get('categories'),
        'budget': plan.get('budget'),
        'planning_cost_total': plan.get('planning_cost_total'),
        'materials_cost_total': plan.get('materials_cost_total'),
        'estimated_duration': plan.get('estimated_duration'),
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == '__main__':
    main()

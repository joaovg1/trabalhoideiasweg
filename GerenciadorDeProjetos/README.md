# GerenciadorDeProjetos

Este projeto recebe uma ideia de projeto industrial ou fabril e gera automaticamente um orçamento, lista de materiais e uma breve descrição do plano.

## Como usar

1. Abra o terminal no diretório do projeto:

```powershell
cd c:\Users\william_balingcos\Documents\ia\GerenciadorDeProjetos
```

2. Execute o programa com a ideia do projeto:

```powershell
python main.py "Aplicativo mobile para agendamento de serviços de jardinagem"
```

3. O resultado será exibido no terminal e gravado em `orcamentos/<nome_do_projeto>_<timestamp>.json`.

4. Para escolher nome e pasta de saída:

```powershell
python main.py "Projeto de fábrica" --output meu_orcamento --output-dir orcamentos
```

5. Para manter cada orçamento em arquivo separado sem informar `--output`, basta rodar o comando com a ideia do projeto e o script gerará automaticamente um nome de arquivo único.

## Estrutura

- `main.py` - interface de linha de comando.
- `gerenciador_de_projetos/planner.py` - lógica de geração do orçamento e materiais.
- `requirements.txt` - dependências do projeto.
- `tests/test_orcamento.py` - testes básicos.

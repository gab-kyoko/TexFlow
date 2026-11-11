# TexFlow

Aplicação React para automatizar o cálculo de tempos e a geração da ficha de Processo Operacional (PO) no desafio Auto-T&M Karsten.

Desenvolvido por **Gabrielle Kyoko e Ana Luiza**.

## Funcionalidades e o que cada uma faz

### 1. Dados da operação

Reúne identificação da PO, revisão, produto, dimensões, pontos/cm, perímetro e equipamento. Esses dados formam o cabeçalho da ficha e alimentam o cálculo.

### 2. Roteiro MTM com frequência e ordenação

Cada procedimento possui código, tempo unitário e frequência. O subtotal é `tempo unitário × frequência`. Os botões de seta alteram a ordem apresentada na ficha.

### 3. Motor de cálculo

- `Tempo FIXO = perímetro × tempo/metro da máquina`.
- `Tempo MTM = soma dos subtotais dos elementos manuais`.
- `Tempo total = tempo FIXO + tempo MTM`.

O cenário oficial PO-SL-001 resulta em **0,9409 min**.

### 4. Validação automática

Impede a exportação quando faltam identificação, operação, perímetro, máquina ou elementos. Também identifica códigos inexistentes e frequências inválidas.

### 5. Importação de arquivos

- `TXT`: lê o formato de demanda fornecido no hackathon.
- `CSV`: lê pares campo/valor ou fichas exportadas pelo TexFlow.
- `ODS`: reconhece a ficha PO e os cadastros `MATRIZ_DE_ELEMENTOS` e `TEMPO-CM`.
- `XLSX`: lê fichas estruturadas em planilha.

Todo o processamento ocorre localmente no navegador.

### 6. Exportações

- `CSV`: formato simples para integração e conferência.
- `XLSX`: planilha formatada e editável.
- `PDF`: documento pronto para impressão e apresentação.

### 7. Comparador de máquinas

Executa o mesmo roteiro em todas as máquinas cadastradas, compara o tempo total e destaca a alternativa mais rápida. O botão de cada cartão aplica a máquina à ficha atual.

### 8. Histórico e revisões

Salva até 30 versões no armazenamento local do navegador. É possível carregar ou excluir versões e criar automaticamente a próxima revisão (`00 → 01 → 02`).

### 9. Modo demonstração

Carrega o cenário oficial e conduz o pitch em cinco etapas: dados, roteiro, comparação, ficha/exportação e memória de cálculo.

### 10. Central de ajuda

Exibe as fórmulas com os valores atuais e uma tabela de auditoria, permitindo que a banca confira a origem do resultado.

## Organização do código

- `src/domain.js`: dados oficiais, fórmulas, validações, revisões e comparação de máquinas.
- `src/importers.js`: leitura de TXT, CSV, ODS e XLSX.
- `src/exporters.js`: geração de CSV, XLSX e PDF.
- `src/main.jsx`: interface e fluxo de trabalho.
- `src/styles.css`: identidade visual e responsividade.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Para gerar a versão de produção:

```bash
npm run build
```

## Dados oficiais carregados

O catálogo MTM e as três máquinas foram transcritos de `Entradas.ods`. O cenário inicial corresponde à demanda `PO-SL-001` e deve resultar em **0,9409 min**.

# Lista de Pendências — FGO Novo Desenrola Brasil

Data: 28/09/2026 · Fonte de regras: Manual BB versão 01.08.2026 (`docs/FGO_MANUAL.txt`)

Três frentes:

- **A — FAQ Remessa** (artefato "Quando usar cada registro da Remessa"): correções no guia.
- **M — Manual / BB**: furos do próprio manual que precisam de confirmação formal com o Administrador.
- **G — gerador-bbsia-manual**: achados da revisão do projeto (Remessa GFGF0010 e leitura dos retornos).

Severidade: **Crítica** (muda a ação do time ou gera rejeição/perda de garantia) · **Alta** (regra omitida que costuma causar rejeição) · **Média** (melhoria de clareza ou robustez) · **Baixa** (cosmético).

---

## A — FAQ Remessa (artefato)

> **Status 28/09/2026:** A-01 a A-16 aplicados na Revisão 2 do artefato (mesmo link) e no arquivo `docs/FAQ_REMESSA_FGO.html` do projeto. Ficam aqui como registro do que mudou.

| ID | Sev. | Pendência | Ação | Ref. manual |
|---|---|---|---|---|
| A-01 | Crítica | Janela de formalização encerrada em 01/08/2026 (31/08/2026 pela Portaria 2.302). Hoje nenhum 03 novo é aceito (rejeição 222), salvo prorrogação posterior ao manual. Os casos "11 + novo 03" e "reuso de código" deixam de valer. | Destacar no topo do artefato e nos casos práticos. Confirmar se houve prorrogação. | §12 (03) |
| A-02 | Crítica | Reuso de código (10 → 11 → novo 03) exige dois dias: a nova pré-validação para o mesmo CPF só passa após o 11 ser processado à noite (rejeições 71 e 192). O novo 03 continua preso aos 15 dias corridos da assinatura original. | Reescrever o caso prático com a linha do tempo e o limite dos 15 dias. | §5.1, §5.5, §12 |
| A-03 | Crítica | Honra (06): data = data de entrega, dia útil, entre 10º e 14º dia útil, e no máximo 180º dia de atraso. A Remessa com 06 tem de ser transmitida naquele dia antes das 22h. Há no máximo três janelas mensais por operação. Falta a regra "todos os valores recebidos amortizados antes da honra". | Incluir bloco "Planejamento da honra" no tipo 06. | §5.9, §8, §12 |
| A-04 | Crítica | 08 só cancela a última recuperação informada (rejeição 187). Para corrigir um 07 antigo é preciso cancelar do mais recente para o mais antigo. | Corrigir o caso "Lançamos um 07 errado". | §14.2 (187) |
| A-05 | Crítica | 93 não vem só por vencimento sem liberação. Tabela 14.13 traz três motivos (saldo não informado, saldo zero, vencida com saldo em normalidade ou sem liberação). Pendência 92 não tratada pode virar 93 ou 94. | Corrigir tabela "Eventos que o FGO gera" e o card de situação "Encerrada". | §5, §5.16, §14.13 |
| A-06 | Alta | 05 após o 9º dia útil só é aceito para regularizar operação pendente. | Incluir no tipo 05. | §12 (05) |
| A-07 | Alta | Primeiro 05 deve ser do mês da primeira liberação (rejeição 270). | Incluir exemplo no tipo 05. | §14.2 (270) |
| A-08 | Alta | Data de início da inadimplência no 05 só pode recuar dentro do mesmo mês (rejeição 251). | Incluir no tipo 05. | §12 (05) |
| A-09 | Alta | Pré-validação com reserva pode ser feita depois da assinatura, em até 15 dias corridos, por conta e risco do Agente. | Incluir no tipo 03. | §5.1 |
| A-10 | Alta | Só cabe um 04 por operação, pois o valor da liberação deve ser igual ao do 03 (rejeições 103 e 120). | Incluir no tipo 04. | §12 (04) |
| A-11 | Alta | No 10, vencimento (142-149), público-alvo (07) e programa (0050) devem repetir o valor atual. Sem nenhuma alteração vem rejeição 42. Em Honrada só o código (rejeição 258). | Incluir no tipo 10. | §5.5, §13.1, §14.2 |
| A-12 | Média | Diagrama de ciclo não mostra "Liquidada pós-honra → Honrada" via 08 nem a impugnação (94) a partir de qualquer estado. | Ajustar o diagrama. | §12 (08), §5.15 |
| A-13 | Média | Faltam efeitos de carteira dos eventos do FGO: 93 reduz só o mutuário; 94 reduz mutuário, Fundo e Agente. | Incluir na tabela "Eventos que o FGO gera". | §5.15, §5.16 |
| A-14 | Média | "A planilha do retorno já traz a descrição" não vem do manual (o 200R devolve só o código em 209-211). Vem da ferramenta interna (gerador-bbsia-manual). | Citar a ferramenta explicitamente. | §13.3 |
| A-15 | Média | Falta a regra "data de formalização maior ou igual à data de habilitação do Agente". | Incluir no tipo 03. | §12 (03) |
| A-16 | Baixa | Item "A confirmar" sobre movimentação no 11 pode ser fechado: o manual define Cancelada pelo Agente como "sem devolução de CCG" e o programa não cobra CCG. Resposta: não movimenta. | Retirar de "A confirmar" e registrar "Não" na tabela de efeitos. | §5 |

## M — Manual / confirmar com o BB

| ID | Sev. | Pendência | Ação | Ref. manual |
|---|---|---|---|---|
| M-01 | Crítica | Prazo de 35 dias da 1ª parcela sem marco inicial (assinatura, liberação ou vencimento da parcela). É item obrigatório de auditoria e impede todas as honras. | Perguntar ao BB e localizar na Portaria MF 1.243. Registrar a premissa adotada pelo Digio. | §5.2, §5.6 |
| M-02 | Crítica | CPF Qualificador (160-170) é tipo N, mas o manual manda espaços. Risco de rejeição 274 em todo 03. | Confirmar com o BB se é espaços ou zeros. Já foi aceito em homologação? | §13, §13.1 |
| M-03 | Alta | Honra fora da janela do 10º ao 14º dia útil: §12 trata como validação, §5.9 diz que só o pagamento muda de data. | Confirmar se o registro é rejeitado (código 35) ou aceito com pagamento adiado. | §5.9, §12 |
| M-04 | Alta | 12 (liquidação) permitido em FORMALIZADA, mas liquidação pressupõe liberação. Operação sem 04 deveria ir por 11. | Confirmar qual evento o BB espera para operação assinada e nunca liberada que o cliente quitou. | §5.7, §12 |
| M-05 | Alta | Data da recuperação (07) tem de ser dia útil, mas pagamentos caem em fim de semana. Manual não diz qual data informar. | Confirmar: data do crédito ou próximo dia útil. | §12 (07), §14.2 (179) |
| M-06 | Alta | Devolução do valor honrado após impugnação (94) é exigida, mas o 09 só aceita situação HONRADA. Não há evento para isso. | Confirmar mecanismo (débito pelo Administrador?). | §5.15, §12 (09) |
| M-07 | Média | Numeração da Remessa substituída no mesmo dia: incrementa (cada aprovação no 010R) ou repete? | Confirmar com o BB e alinhar com o parâmetro `numeroSequencialRemessa`. | §8, §10, §13.2 |
| M-08 | Média | "Prazo máximo em pendência" que leva a 93/94 nunca é quantificado (só os 15 dias após e-mail). | Perguntar ao BB. | §5, §5.15 |
| M-09 | Média | Estados sem procedimento no programa (Parcelada pós-honra, Liquidada com abatimento, Cedida com deságio, Extinta, Cancelada com devolução de CCG) e dezenas de códigos de rejeição legados. | Tratar como inalcançáveis; não modelar no Digio até o BB confirmar. | §14.2, §14.14, §14.16 |
| M-10 | Baixa | Data da MP 1.355: 04/05/2026 (§2, §12) vs 05/05/2026 (glossário). | Apenas registrar. | §1, §2 |
| M-11 | Baixa | Vestígios de múltiplas liberações e cronogramas (campo 122, rejeições 103, 157, 169) contradizem o valor único igual ao 03. | Apenas registrar. | §1, §13.1 |
| M-12 | Baixa | Leiaute 96 do 270R com posições erradas no manual (117-125 e 126-211 não fecham 211). A ferramenta usa 117-124 e 125-211. | Confirmar com o BB na próxima versão do manual. | §13.6 |

## G — Projeto gerador-bbsia-manual

Resultado geral: leiautes da Remessa (01, 03 a 13, 99) e dos cinco retornos conferidos posição a posição contra o manual, todos batem. Typecheck limpo. CSV e XLSX de exemplo geram arquivo idêntico. Os seis retornos de exemplo viraram planilha com descrições das tabelas §14. O que falta está abaixo.

| ID | Sev. | Pendência | Ação | Onde |
|---|---|---|---|---|
| G-01 | Crítica | A pasta não é repositório git (sem `.git`). Ferramenta que gera arquivo regulatório sem versionamento nem histórico. | `git init` e primeiro commit; definir remoto. | raiz |
| G-02 | Crítica | Opção `--ordenar-por-tipo` contraria a regra de ordem cronológica do manual e quebra o caso "13 + 05 na mesma Remessa": o 05 fica antes do 13 e é rejeitado (operação ainda liquidada). | Remover a opção ou emitir erro quando houver 13 e 05 da mesma operação. | `src/gerador.ts` |
| G-03 | Alta | `formatarAlfanumerico` trunca `idAcordo` acima de 20 posições só com aviso. Um código truncado vira outra operação no FGO. | Transformar em erro. Validar também primeiro caractere (letra ou número) e caracteres permitidos. | `src/formatadores.ts` |
| G-04 | Alta | `formatarMoeda` e `formatarDecimal` arredondam valores com mais casas que o leiaute em silêncio (ex.: 0,285 → 28 centavos). Saldos precisam bater centavo a centavo com o 06. | Rejeitar entrada com mais casas que o campo. | `src/formatadores.ts` |
| G-05 | Alta | Sem testes automatizados. Não há `npm test`. | Criar testes golden: CSV exemplo → txt esperado; cada retorno exemplo → campos esperados; teste de posições por tipo. | raiz |
| G-06 | Alta | Índice de perda esperada: inteiro é lido como formato bruto ("1" vira 0,000001). Célula numérica 1 na planilha (100%) sai errada. | Aceitar só decimal, ou exigir 7 dígitos no formato bruto. | `src/formatadores.ts` (`normalizarIndicePerdaEsperada`) |
| G-07 | Alta | `exemplo-remessa-2.csv` envia 05 com todos os saldos zerados, o que o manual proíbe (gera pendência 92 tipo 02; o correto é o 12). Se foi caso real, precisa de correção operacional. | Trocar o exemplo por 12 ou documentar como caso de erro. Confirmar se foi enviado à produção. | `entrada/exemplo-remessa-2.csv` |
| G-08 | Média | Exemplos da Remessa misturam casos que o FGO tende a rejeitar: 10 alterando vencimento (manual só permite código, renda e IBGE), 07 e 08 da mesma recuperação na mesma Remessa, 12 e 13 da mesma operação na mesma Remessa. Confunde quem usa como referência. | Separar em "exemplo válido" e "exemplo de rejeições". | `entrada/exemplo-remessa.csv`, `modelo-remessa.xlsx` |
| G-09 | Média | Validações baratas de negócio ausentes, embora o README declare que não valida §12: fim de semana em datas que exigem dia útil (06 a 13), data de apuração do 05 igual ao último dia do mês, janela 91 a 180 dias no 06, 05 duplicado para a mesma operação e mês, 04 com valor diferente do 03 quando ambos estão no mesmo arquivo, 10 antes do 11 na troca de código. | Implementar como avisos (não bloqueantes) para reduzir rejeições no 200R. | `src/csv.ts`, `src/gerador.ts` |
| G-10 | Média | `numeroSequencialRemessa` fica no JSON e depende de edição manual. Regra do manual (repete após rejeição no 010R, incrementa após aprovação) não é apoiada pela ferramenta. | Arquivo de estado simples ou pelo menos aviso quando o número repetir o da última saída. | `config/parametros.json`, `src/index.ts` |
| G-11 | Média | Módulo `retorno450r/` duplica o que `retornos/` já faz para o 450R (duas fontes de verdade). | Remover ou marcar como legado só para gerar arquivo fake de teste. | `src/retorno450r/` |
| G-12 | Média | CPF Qualificador gravado com espaços em campo N (segue o texto do manual). Depende de M-02. | Ajustar conforme resposta do BB. | `src/registros.ts` |
| G-13 | Baixa | Terminador CRLF: o manual diz "sem separadores entre registros", mas o teste real de upload (2.130 bytes = 10 linhas × 213) confirma CRLF aceito. Retornos reais vêm com LF (424 bytes = 2 × 212); o leitor já aceita ambos. | Registrar a evidência no README. | `docs/DEV-README.md` |
| G-14 | Baixa | Leitura do CSV em UTF-8 e gravação em latin1: caractere fora do latin1 vira "?" sem aviso. | Validar caracteres permitidos nos campos A (cobre G-03). | `src/csv.ts` |

---

## Próximos passos sugeridos

1. Levar M-01 a M-06 ao BB em uma única mensagem (canal fgo@bb.com.br ou gestor da conta).
2. Corrigir A-01 a A-05 no artefato e republicar.
3. Abrir git no projeto (G-01), depois G-02, G-03 e G-04, que são correções pequenas.
4. Definir se os exemplos G-07 e G-08 refletem casos reais enviados.

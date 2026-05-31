export function ofuscarCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return '***'
  return `${digits.slice(0, 3)}******${digits.slice(9)}`
}

export function ofuscarCpfNaUrl(texto: string): string {
  return texto.replace(/\b(\d{3})\d{6}(\d{2})\b/g, '$1******$2')
}

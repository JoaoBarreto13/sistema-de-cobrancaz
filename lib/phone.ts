// 55 + DDD + últimos 8 dígitos. Ignora o 9 extra (casamento de nº brasileiro).
// Sem alias '@/' — este arquivo é importado tanto pelo worker quanto pelo web.
export function phoneKey(raw: string): string {
  const d = raw.replace(/\D/g, '')
  return d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(0, 4) + d.slice(-8) : d
}

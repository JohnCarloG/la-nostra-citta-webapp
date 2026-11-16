/** Input follows the full manifest order (creato_il, id); hidden files retain their ordinal. */
export function numberedReadyMedia<T extends { stato_file: string }>(media: T[]) {
  return media.map((item, index) => ({ ...item, numeroAllegato: index + 1 }))
    .filter(item => item.stato_file === 'READY');
}

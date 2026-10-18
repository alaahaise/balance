/** Les migrations sont importées comme texte : un fichier .sql n'est pas du JS. */
declare module '*.sql?raw' {
  const content: string
  export default content
}

// Class names Lexical applies to its DOM output. We let Tailwind do the
// actual styling — each class here just gives us a stable hook.

const editorTheme = {
  paragraph: 'mb-3 leading-relaxed',
  heading: {
    h1: 'text-3xl font-bold mt-6 mb-3 text-kotoba-primary',
    h2: 'text-2xl font-bold mt-5 mb-3 text-kotoba-primary',
    h3: 'text-xl font-semibold mt-4 mb-2 text-kotoba-primary',
    h4: 'text-lg font-semibold mt-3 mb-2 text-kotoba-text',
  },
  list: {
    nested: { listitem: 'list-none' },
    ol: 'list-decimal ml-6 mb-3',
    ul: 'list-disc ml-6 mb-3',
    listitem: 'mb-1',
  },
  quote: 'border-l-4 border-kotoba-primary/40 pl-4 italic text-kotoba-text/80 my-3',
  link: 'text-kotoba-primary underline hover:text-kotoba-primary/80',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'bg-kotoba-background px-1 py-0.5 rounded font-mono text-sm',
  },
  code: 'block bg-kotoba-background p-3 rounded font-mono text-sm overflow-x-auto my-3',
  vocab:
    'inline-flex items-baseline gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-kotoba-secondary/40 ' +
    'text-kotoba-text cursor-help border-b border-dashed border-kotoba-primary/50',
};

export default editorTheme;

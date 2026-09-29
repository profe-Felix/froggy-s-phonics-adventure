// Card data for the "Creando oraciones" activity.
// Source: cards.json manifest from the ©Hola Bilinguals packet.
// 54 cards: 18 ¿Quién?, 18 ¿Qué?, 18 ¿Dónde? — each with a colored
// illustration and a matching black-and-white line drawing.
// Images are served from /sentence-cards/color/ and /sentence-cards/bw/.

export const CARD_CATEGORIES = [
  { id: 'who', label: '¿Quién?', color: '#ec4899', bg: '#fdf2f8', border: '#f9a8d4' },
  { id: 'what', label: '¿Qué?', color: '#84cc16', bg: '#f7fee7', border: '#bef264' },
  { id: 'where', label: '¿Dónde?', color: '#14b8a6', bg: '#f0fdfa', border: '#5eead4' },
];

const img = (filename) => ({
  color: `/sentence-cards/color/${filename}`,
  bw: `/sentence-cards/bw/${filename}`,
});

export const CARDS = [
  // ── ¿Quién? (who) — 18 cards ──
  { id: 'who-01', category: 'who', text: 'El pez', ...img('who-01-el-pez.png') },
  { id: 'who-02', category: 'who', text: 'La vaca', ...img('who-02-la-vaca.png') },
  { id: 'who-03', category: 'who', text: 'El papá', ...img('who-03-el-papa.png') },
  { id: 'who-04', category: 'who', text: 'El hada', ...img('who-04-el-hada.png') },
  { id: 'who-05', category: 'who', text: 'La rana', ...img('who-05-la-rana.png') },
  { id: 'who-06', category: 'who', text: 'La llama', ...img('who-06-la-llama.png') },
  { id: 'who-07', category: 'who', text: 'El bebé', ...img('who-07-el-bebe.png') },
  { id: 'who-08', category: 'who', text: 'El lobo', ...img('who-08-el-lobo.png') },
  { id: 'who-09', category: 'who', text: 'El oso', ...img('who-09-el-oso.png') },
  { id: 'who-10', category: 'who', text: 'El gato', ...img('who-10-el-gato.png') },
  { id: 'who-11', category: 'who', text: 'La abeja', ...img('who-11-la-abeja.png') },
  { id: 'who-12', category: 'who', text: 'La abuela', ...img('who-12-la-abuela.png') },
  { id: 'who-13', category: 'who', text: 'La maestra', ...img('who-13-la-maestra.png') },
  { id: 'who-14', category: 'who', text: 'La sirena', ...img('who-14-la-sirena.png') },
  { id: 'who-15', category: 'who', text: 'El pirata', ...img('who-15-el-pirata.png') },
  { id: 'who-16', category: 'who', text: 'El equipo', ...img('who-16-el-equipo.png') },
  { id: 'who-17', category: 'who', text: 'La mariposa', ...img('who-17-la-mariposa.png') },
  { id: 'who-18', category: 'who', text: 'El dentista', ...img('who-18-el-dentista.png') },

  // ── ¿Qué? (what) — 18 cards, no period (period added by sentence assembler) ──
  { id: 'what-01', category: 'what', text: 'paga', ...img('what-01-paga.png') },
  { id: 'what-02', category: 'what', text: 'cena', ...img('what-02-cena.png') },
  { id: 'what-03', category: 'what', text: 'seca la ropa', ...img('what-03-seca-la-ropa.png') },
  { id: 'what-04', category: 'what', text: 'toma leche', ...img('what-04-toma-leche.png') },
  { id: 'what-05', category: 'what', text: 'come chile', ...img('what-05-come-chile.png') },
  { id: 'what-06', category: 'what', text: 'sube la cima', ...img('what-06-sube-la-cima.png') },
  { id: 'what-07', category: 'what', text: 'come kiwi', ...img('what-07-come-kiwi.png') },
  { id: 'what-08', category: 'what', text: 'hace fila', ...img('what-08-hace-fila.png') },
  { id: 'what-09', category: 'what', text: 'come pizza', ...img('what-09-come-pizza.png') },
  { id: 'what-10', category: 'what', text: 'se sienta', ...img('what-10-se-sienta.png') },
  { id: 'what-11', category: 'what', text: 'hace sopa', ...img('what-11-hace-sopa.png') },
  { id: 'what-12', category: 'what', text: 'corre', ...img('what-12-corre.png') },
  { id: 'what-13', category: 'what', text: 'hace yoga', ...img('what-13-hace-yoga.png') },
  { id: 'what-14', category: 'what', text: 'toma jugo', ...img('what-14-toma-jugo.png') },
  { id: 'what-15', category: 'what', text: 'escucha música', ...img('what-15-escucha-musica.png') },
  { id: 'what-16', category: 'what', text: 'come chocolate', ...img('what-16-come-chocolate.png') },
  { id: 'what-17', category: 'what', text: 'duerme', ...img('what-17-duerme.png') },
  { id: 'what-18', category: 'what', text: 'espía', ...img('what-18-espia.png') },

  // ── ¿Dónde? (where) — 18 cards, each ends with a period ──
  { id: 'where-01', category: 'where', text: 'en la cama.', ...img('where-01-en-la-cama.png') },
  { id: 'where-02', category: 'where', text: 'en el yate.', ...img('where-02-en-el-yate.png') },
  { id: 'where-03', category: 'where', text: 'en la bici.', ...img('where-03-en-la-bici.png') },
  { id: 'where-04', category: 'where', text: 'en la mina.', ...img('where-04-en-la-mina.png') },
  { id: 'where-05', category: 'where', text: 'en la tina.', ...img('where-05-en-la-tina.png') },
  { id: 'where-06', category: 'where', text: 'en el taxi.', ...img('where-06-en-el-taxi.png') },
  { id: 'where-07', category: 'where', text: 'en el lago.', ...img('where-07-en-el-lago.png') },
  { id: 'where-08', category: 'where', text: 'en el nido.', ...img('where-08-en-el-nido.png') },
  { id: 'where-09', category: 'where', text: 'en la cuna.', ...img('where-09-en-la-cuna.png') },
  { id: 'where-10', category: 'where', text: 'en la cocina.', ...img('where-10-en-la-cocina.png') },
  { id: 'where-11', category: 'where', text: 'en el autobús.', ...img('where-11-en-el-autobus.png') },
  { id: 'where-12', category: 'where', text: 'en la jaula.', ...img('where-12-en-la-jaula.png') },
  { id: 'where-13', category: 'where', text: 'en la ciudad.', ...img('where-13-en-la-ciudad.png') },
  { id: 'where-14', category: 'where', text: 'en la fiesta.', ...img('where-14-en-la-fiesta.png') },
  { id: 'where-15', category: 'where', text: 'en el cuarto.', ...img('where-15-en-el-cuarto.png') },
  { id: 'where-16', category: 'where', text: 'en la feria.', ...img('where-16-en-la-feria.png') },
  { id: 'where-17', category: 'where', text: 'en el zoológico.', ...img('where-17-en-el-zoologico.png') },
  { id: 'where-18', category: 'where', text: 'en la escuela.', ...img('where-18-en-la-escuela.png') },
];

export const CARDS_BY_CATEGORY = {
  who: CARDS.filter(c => c.category === 'who'),
  what: CARDS.filter(c => c.category === 'what'),
  where: CARDS.filter(c => c.category === 'where'),
};

export const CARD_MAP = Object.fromEntries(CARDS.map(c => [c.id, c]));

// Assemble a sentence from card texts. Capitalizes the first letter and
// places one final period: after the action in 2-part mode, or after the
// location in 3-part mode (where cards already include their own period).
export function assembleSentence(whoCard, whatCard, whereCard, mode) {
  const whoText = whoCard?.text || '';
  const whatText = whatCard?.text || '';
  const whereText = whereCard?.text || '';

  let sentence;
  if (mode === '3part' && whereText) {
    // where cards already end with a period
    sentence = `${whoText} ${whatText} ${whereText}`;
  } else {
    // 2-part: add period after what
    sentence = `${whoText} ${whatText}.`;
  }
  // Capitalize first letter
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
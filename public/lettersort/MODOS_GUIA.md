# Clasificador de letras — Guía de modos

Esta guía explica cada **tipo de sort** (modo) del Clasificador de letras,
cuándo usarlo y qué parámetros acepta. Los parámetros se pasan al juego por la
URL; esta página los construye a partir de los campos que ves en pantalla.

> Consejo: si un modo incluye **presets** (ejemplos curados) en el menú
> desplegable, empieza por uno de ellos y ajusta los campos. Los presets
> etiquetados "Ejemplo ·" son configuraciones de muestra que llenan los campos
> automáticamente y puedes editarlos.

---

## Convenciones de formato

| Formato | Significado | Ejemplo |
|---|---|---|
| Lista separada por comas | Varios valores en un campo de texto | `a, b, ch` |
| `título~palabra1,palabra2; título2~p3,p4` | Filas: cada segmento `;` es una fila, `~` separa el título de sus tarjetas | `animales~perro,gato; cosas~mesa,silla` |
| `palabra:init; palabra:final` | Definición de filas por sílaba (inicio/final) | `cebra:init; bici:final` |
| `col1,col2 \| col3,col4` | Columnas separadas por `|`, sílabas por `,` | `ya,ye,yi \| za,ze,zi` |

**Toggles (opciones avanzadas)** — comunes a varios modos:

- **Solo palabras (sin imágenes)**: muestra solo el texto, sin la imagen de la tarjeta.
- **Cubrir palabras (tocar para revelar)**: la palabra queda oculta hasta que el alumno la toca.
- **Tarjetas divididas (palabra + imagen)**: cada tarjeta se parte en dos mitades.
- **Ocultar títulos de columna**: no muestra el encabezado de cada columna.
- **Etiquetas con emoji**: usa emojis como etiquetas de columna.

---

## 1. Letras iniciales  ·  `letters`

**Cuándo usarlo:** Cuando enseñas correspondencia letra–sonido y aislamiento
del fonema inicial. Los alumnos ordenan tarjetas en columnas según la letra
con la que empieza cada palabra.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `letters` | texto | `a, b, ch` | Letras objetivo (una columna por letra) |
| `per` | número | `4` | Tarjetas por columna |

**Ejemplo:** `letters=a,e,i,o,u,m,p,s,t&per=4`

---

## 2. Sonido inicial aleatorio  ·  `mode=randinit`

**Cuándo usarlo:** Variante de "Letras iniciales" para práctica variada: el
maestro define un pool de sonidos y la app elige al azar cuáles usar.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `pool` | texto | `b, m, s, ch` | Pool de letras/sonidos a elegir |
| `per` | número | `4` | Tarjetas por columna |

**Ejemplo:** `mode=randinit&pool=b,m,s,ch&per=4`

---

## 3. Sílabas objetivo  ·  `syllables`

**Cuándo usarlo:** Cuando los alumnos identifican una sílaba específica dentro
de la palabra (al inicio o en cualquier posición).

| Parámetro | Tipo | Opciones / Ejemplo | Descripción |
|---|---|---|---|
| `syllables` | texto | `ma, pa, sa` | Sílabas objetivo |
| `syllmatch` | select | `initial` · `any` | ¿Dónde coincide la sílaba? |
| `syllcmp` | select | `equals` · `contains` · `prefix` · `suffix` | Tipo de comparación |
| `per` | número | `4` | Tarjetas por columna |

---

## 4. Conteo de sílabas  ·  `syllcount`

**Cuándo usarlo:** Conciencia silábica y conteo. Los alumnos ordenan palabras
según cuántas sílabas tienen.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `counts` | texto | `1-3` o `1,2,3` | Cantidades de sílabas (una columna por cantidad) |
| `per` | número | `4` | Tarjetas por columna |

**Ejemplo:** `counts=2,3,4&per=4`

---

## 5. Conteo de sonidos  ·  `phonemes`

**Cuándo usarlo:** Conteo de fonemas. Ordena palabras por el número de sonidos.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `phonemes` | texto | `3-5` | Cantidades de sonidos |
| `per` | número | `4` | Tarjetas por columna |

**Ejemplo:** `phonemes=3,4,5&per=4`

---

## 6. Sílaba tónica  ·  `stress`

**Cuándo usarlo:** Enseñar acento/prosodia. Ordena palabras según la posición
de la sílaba tónica: **1** = aguda, **2** = grave, **3** = esdrújula.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `stress` | texto | `1,2,3` | Posiciones tónicas (una columna por posición) |
| `per` | número | `4` | Tarjetas por columna |

**Ejemplo:** `stress=1,2,3&per=4`

---

## 7. Sílaba tónica (revelar)  ·  `mode=stressreveal`

**Cuándo usarlo:** Variante más visual de la tónica: sobre una escena de fondo,
el alumno revela la sílaba acentuada de cada palabra.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `stress` | texto | `1,2` | Posiciones tónicas a practicar |
| `words` | texto | `gato,casa,perro` | Lista de palabras |
| `bg` | texto | `scene.jpg` | (Opcional) imagen de fondo |

**Ejemplo:** `mode=stressreveal&stress=1,2&words=gato,casa,perro,sopa`

---

## 8. Ordenar palabras  ·  `mode=sort`

**Cuándo usarlo:** Secuenciación y conceptos ordinales. El alumno ordena una
lista en un continuo (ej. *menos interesado → más interesado*) con etiquetas
en los extremos.

| Parámetro | Tipo | Opciones / Ejemplo | Descripción |
|---|---|---|---|
| `words` | texto | `interesado, emocionado, ...` | Lista de palabras a ordenar |
| `layout` | select | `side` · `top` · `vertical` · `horizontal` | Disposición |
| `direction` | select | `bottom-up` · `top-down` · `left-right` · `right-left` | Dirección del orden |
| `bottom` / `top` | texto | `menos` / `más` | Etiquetas de los extremos (vertical) |
| `left` / `right` | texto | `menos` / `más` | Etiquetas de los extremos (horizontal) |

---

## 9. Clasificación manual  ·  `mode=manualsort`

**Cuándo usarlo:** Cuando ninguna categoría predefinida encaja. Defines tus
propios encabezados y qué tarjetas van en cada uno.

| Parámetro | Tipo | Opciones / Ejemplo | Descripción |
|---|---|---|---|
| `headers` | texto | `barn, ocean` | Encabezados (una columna por encabezado) |
| `answers` | texto | `barn:sheep,chicken \| ocean:whale` | Respuestas: `encabezado:item1,item2` separados por `|` |
| `headertype` | select | `image` · `text` | Tipo de encabezado |
| `cardtype` | select | `word` · `image` | Tipo de tarjeta |
| `layout` | select | `side` · `top` · `vertical` · `horizontal` | Disposición |

---

## 10. Modo filas  ·  `mode=row`

**Cuándo usarlo:** Agrupar tarjetas en filas, cada una con su título. Útil para
categorías que se prestan a disposición horizontal.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `rows` | texto | `animales~perro,gato; cosas~mesa,silla` | `título~tarjetas` por cada fila `;` |
| `rowtitle` | toggle | `true` | Mostrar el título de cada fila |

**Ejemplo:** `mode=row&rows=animales~perro,gato,pez; cosas~mesa,silla,vaso&rowtitle=true`

---

## 11. Aliteración por filas  ·  `mode=rowalli`

**Cuándo usarlo:** Práctica de aliteración. Cada fila agrupa palabras que
empiezan con el mismo sonido.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `rows` | texto | `M~manzana,mayo; P~pana,pato` | `sonido~palabras` por fila |
| `rowtitle` | toggle | `true` | Mostrar el título de cada fila |

**Ejemplo:** `mode=rowalli&rows=M~manzana,mayo,mano; P~pana,pato,piso&rowtitle=true`

---

## 12. Sílabas iniciales por filas  ·  `mode=allisyll`

**Cuándo usarlo:** Como la aliteración, pero agrupando por **sílaba inicial**.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `rows` | texto | `ma~mama,mapa; sa~salsa,sapo` | `sílaba~palabras` por fila |
| `rowtitle` | toggle | `true` | Mostrar el título de cada fila |

**Ejemplo:** `mode=allisyll&rows=ma~mama,mapa,mano; sa~salsa,sapo,sano&rowtitle=true`

---

## 13. Sílabas (inicio/final) por filas  ·  `mode=rowsyll`

**Cuándo usarlo:** Trabajo de sílaba al inicio (onset) o al final (rime). Cada
fila define una palabra clave y si se fija en el inicio o el final.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `rows` | texto | `cebra:init; bici:final` | `palabra:inicio/final` por fila |
| `words` | texto | `ceja, dulce, cine, ...` | Lista de tarjetas a colocar |
| `rowtitle` | toggle | `false` | Mostrar el título de cada fila |

**Ejemplo:** `mode=rowsyll&rows=cebra:init; bici:final&words=ceja,dulce,cine,cero`

---

## 14. Columnas de sílabas  ·  `mode=rowsyllcols`

**Cuándo usarlo:** Clasificación de sílabas en una cuadrícula filas×columnas,
con distractores opcionales para mayor dificultad.

| Parámetro | Tipo | Opciones / Ejemplo | Descripción |
|---|---|---|---|
| `rowsyll` | texto | `ya,ye,yi \| za,ze,zi` | Columnas de sílabas (`|` = columna) |
| `words` | texto | `yema, zapato, yogur, ...` | Tarjetas a colocar |
| `headertype` | select | `image` · `text` | Tipo de encabezado |
| `cardtype` | select | `word` · `image` | Tipo de tarjeta |
| `match` | select | `syllable-start` · `contains` · `word-contains` | Coincidencia |
| `layout` | select | `side` · `top` · `vertical` · `horizontal` | Disposición |
| `distractors` | número | `0` | Tarjetas distractoras extra |

---

## 15. Grupos de sílabas  ·  `mode=syllgroups`

**Cuándo usarlo:** Comparar familias de sílabas entre grupos, con títulos
personalizados para cada grupo.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `groups` | texto | `k \| x \| w` | Grupos (`|` o `,` como separador) |
| `words` | texto | `karate, saxo, boxeo, ...` | Tarjetas a colocar |
| `titles` | texto | `sí,no,maybe` | Títulos de los grupos |

---

## 16. Generar palabras  ·  `mode=generate`

**Cuándo usarlo:** Actividades de vocabulario y generación de palabras a partir
de adivinanzas o definiciones, distribuidas en columnas con espacios.

| Parámetro | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `riddle` | texto | `Texto \| oculto \| ...` | Adivinanza / definición |
| `columns` | texto | `tazón, sano` | Palabras/columna objetivo |
| `rows` | texto | `4,4` | Filas por columna (un número por columna) |
| `slots` | número | `2` | Espacios a completar |

**Ejemplo:** `mode=generate&columns=tazón,sano&rows=4,4&slots=2`

---

## Notas

- Los **presets** del menú desplegable son configuraciones curadas que ya
  existen en el almacenamiento compartido. Los marcados **"Ejemplo ·"** son
  muestras incluidas en la app que rellenan los campos automáticamente y puedes
  editar antes de lanzar la actividad.
- El campo **Parámetros avanzados (query extra)** permite añadir cualquier
  parámetro extra de la URL (`clave=valor`, separados por `&`) no cubierto por
  los campos visibles.
- Comparte la actividad con los alumnos con el botón **QR estudiante**.

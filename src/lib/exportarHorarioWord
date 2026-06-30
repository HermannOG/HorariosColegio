// ========================================================================
// EXPORTACIÓN DEL HORARIO A WORD (.docx)
// ------------------------------------------------------------------------
// Genera un documento Word con la grilla del horario tal como se ve en
// pantalla (por profesor o por grupo), usando la librería `docx` (corre

// en el navegador, sin necesidad de backend). El documento se arma con
// exactamente los mismos datos que ya están cargados en HorarioPage —
// no se vuelve a consultar Firestore acá.
// ========================================================================

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageOrientation,
} from 'docx'

const DIAS_LABEL = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' }
const DIAS_ORDEN = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']

const BORDE = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE }

// Ancho de página en landscape (Letter), menos márgenes de 0.5" a cada
// lado: 15840 - 720 - 720 = 14400 DXA disponibles para la tabla.
const ANCHO_HORA = 1700
const ANCHO_LECCION = 850
const ANCHO_DIA = Math.floor((14400 - ANCHO_HORA - ANCHO_LECCION) / 5)
const ANCHOS_COLUMNA = [ANCHO_HORA, ANCHO_LECCION, ...DIAS_ORDEN.map(() => ANCHO_DIA)]
// Ajuste fino para que la suma cierre exacto en 14400 (por el redondeo de Math.floor).
const ANCHO_TABLA = ANCHOS_COLUMNA.reduce((a, b) => a + b, 0)
ANCHOS_COLUMNA[ANCHOS_COLUMNA.length - 1] += 14400 - ANCHO_TABLA

function celdaEncabezado(texto) {
  return new TableCell({
    borders: BORDES,
    shading: { fill: 'E4E8EF', type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: texto, bold: true })] })],
  })
}

function celdaSimple(texto, { align = AlignmentType.LEFT, bold = false } = {}) {
  return new TableCell({
    borders: BORDES,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text: texto, bold })] })],
  })
}

// Celda de una clase ocupada: línea principal en negrita (materia o
// actividad) + línea secundaria gris (grupo, o profesor, según la vista).
function celdaClase(principal, secundaria) {
  const runs = [new TextRun({ text: principal, bold: true })]
  if (secundaria) {
    runs.push(new TextRun({ text: secundaria, color: '6F82A3', size: 18, break: 1 }))
  }
  return new TableCell({
    borders: BORDES,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: runs })],
  })
}

function celdaVacia() {
  return new TableCell({
    borders: BORDES,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: '—', color: 'C7D0DE' })] })],
  })
}

function filaSeparadora(texto) {
  return new TableRow({
    children: [
      new TableCell({
        borders: BORDES,
        columnSpan: 2 + DIAS_ORDEN.length,
        shading: { fill: 'F3F5F8', type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: texto, bold: true, size: 18 })] })],
      }),
    ],
  })
}

// Arma las filas de la tabla a partir de los bloques de la grilla y una
// función `obtenerCelda(dia, bloqueId)` que devuelve la asignación de esa
// celda (o null/undefined si está libre), igual que `celda()` en
// TablaHorario dentro de HorarioPage.jsx.
function construirFilas({ bloques, obtenerCelda, contenidoCelda }) {
  const filas = [
    new TableRow({
      tableHeader: true,
      children: [
        celdaEncabezado('Hora'),
        celdaEncabezado('Lecc.'),
        ...DIAS_ORDEN.map(d => celdaEncabezado(DIAS_LABEL[d])),
      ],
    }),
  ]

  for (const bloque of bloques) {
    if (bloque.tipo !== 'clase') {
      filas.push(filaSeparadora(`${bloque.horaInicio} – ${bloque.horaFin}  —  ${(bloque.etiqueta || '').toUpperCase()}`))
      continue
    }
    filas.push(new TableRow({
      children: [
        celdaSimple(`${bloque.horaInicio} – ${bloque.horaFin}`),
        celdaSimple(bloque.numero || '', { align: AlignmentType.CENTER, bold: true }),
        ...DIAS_ORDEN.map(dia => {
          const asignacion = obtenerCelda(dia, bloque.id)
          if (!asignacion) return celdaVacia()
          const { principal, secundaria } = contenidoCelda(asignacion)
          return celdaClase(principal, secundaria)
        }),
      ],
    }))
  }

  return filas
}

// ------------------------------------------------------------------------
// Punto de entrada público.
//
// `modo`: 'profesor' | 'grupo'
// `idSeleccionado`: id del profesor o grupo cuyo horario se exporta
// `titulo`: texto descriptivo para el encabezado del documento (ej:
//           "Heidi Ruiz Víquez — Matemática, Cívica" o "9-2")
// `bloques`: array de bloques de la grilla (igual que en HorarioPage)
// `asignaciones`: array de asignaciones del horario generado
// `mapaMaterias`, `mapaActividades`, `mapaGrupos`, `mapaProfesores`: igual
// que en HorarioPage, para resolver nombres a partir de ids.
// ------------------------------------------------------------------------
export async function generarDocxHorario({
  modo, idSeleccionado, titulo, bloques, asignaciones,
  mapaMaterias, mapaActividades, mapaGrupos, mapaProfesores,
}) {
  function obtenerCelda(dia, bloqueId) {
    return asignaciones.find(a => {
      if (a.dia !== dia || a.bloqueId !== bloqueId) return false
      return modo === 'profesor' ? a.profesorId === idSeleccionado : a.grupoId === idSeleccionado
    })
  }

  function contenidoCelda(asignacion) {
    if (asignacion.esActividad) {
      return {
        principal: mapaActividades[asignacion.actividadId] || 'Actividad',
        secundaria: 'Actividad del colegio',
      }
    }
    const principal = mapaMaterias[asignacion.materiaId] || '—'
    const secundaria = modo === 'profesor' ? mapaGrupos[asignacion.grupoId] : mapaProfesores[asignacion.profesorId]
    return { principal, secundaria }
  }

  const filas = construirFilas({ bloques, obtenerCelda, contenidoCelda })

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 20 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, font: 'Arial', color: '161C34' },
          paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(titulo)] }),
        new Table({ width: { size: ANCHO_TABLA, type: WidthType.DXA }, columnWidths: ANCHOS_COLUMNA, rows: filas }),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  return blob
}

// Dispara la descarga del blob en el navegador con el nombre dado —
// sin depender de ninguna librería extra (file-saver, etc.).
export function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombreArchivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Arma un nombre de archivo seguro a partir de un texto libre (sin
// caracteres problemáticos para el sistema de archivos).
export function nombreArchivoSeguro(texto) {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

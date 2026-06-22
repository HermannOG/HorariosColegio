import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarProfesores, listarGrupos, listarMaterias, obtenerHorarioActual } from '../lib/datos.js'
import { PageHeader, Card, Spinner } from '../components/ui.jsx'

export default function InicioPage() {
  const [cargando, setCargando] = useState(true)
  const [resumen, setResumen] = useState(null)

  useEffect(() => {
    async function cargar() {
      const [profesores, grupos, materias, horario] = await Promise.all([
        listarProfesores(), listarGrupos(), listarMaterias(), obtenerHorarioActual(),
      ])
      setResumen({ profesores, grupos, materias, horario })
      setCargando(false)
    }
    cargar()
  }, [])

  return (
    <div>
      <PageHeader
        title="Panel general"
        subtitle="Estado actual de los datos cargados para armar el horario del colegio."
      />
      <div className="px-10 py-8">
        {cargando ? <Spinner /> : (
          <>
            <div className="grid grid-cols-4 gap-4 mb-8">
              <Stat label="Profesores" value={resumen.profesores.length} to="/profesores" />
              <Stat label="Grupos" value={resumen.grupos.length} to="/grupos" />
              <Stat label="Materias" value={resumen.materias.length} to="/materias" />
              <Stat
                label="Lecciones sin ubicar"
                value={resumen.horario.conflictos?.length || 0}
                to="/horario"
                tone={resumen.horario.conflictos?.length ? 'clay' : 'sage'}
              />
            </div>

            <Card className="p-6">
              <h3 className="font-display text-lg text-ink-900 mb-3">Cómo armar el horario, paso a paso</h3>
              <ol className="space-y-2.5 text-sm text-ink-600">
                <Paso n={1} texto="Configurá la grilla del día (horas, recreos, almuerzo) en «Grilla del día»." />
                <Paso n={2} texto="Agregá las materias que se imparten en el colegio." />
                <Paso n={3} texto="Agregá los grupos del año (ej: 9-1, 9-2, 11-4...)." />
                <Paso n={4} texto="Definí la malla curricular de cada año en «Malla curricular» (cuántas lecciones de cada materia le corresponden, ej: 5 de Matemática en 9° año)." />
                <Paso n={5} texto="Agregá cada profesor: sus días libres, preferencias, y qué materia da a cada grupo. Las lecciones por semana se sugieren solas según la malla." />
                <Paso n={6} texto="Entrá a «Horario» y generá el horario automáticamente. Si algo no se pudo ubicar o no coincide con la malla, vas a verlo marcado ahí para ajustarlo." />
              </ol>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, to, tone = 'ink' }) {
  const toneClasses = {
    ink: 'text-ink-900',
    sage: 'text-sage-700',
    clay: 'text-clay-600',
  }
  return (
    <Link to={to}>
      <Card className="p-5 hover:border-ink-300 transition-colors">
        <p className="text-xs font-medium text-ink-400 uppercase tracking-wide mb-2">{label}</p>
        <p className={`font-display text-3xl ${toneClasses[tone]}`}>{value}</p>
      </Card>
    </Link>
  )
}

function Paso({ n, texto }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-5 h-5 rounded-full bg-ink-100 text-ink-600 text-xs font-semibold flex items-center justify-center mt-0.5">{n}</span>
      <span>{texto}</span>
    </li>
  )
}

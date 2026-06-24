import { useEffect, useState } from 'react'
import { obtenerMallas, guardarMalla, listarMaterias } from '../lib/datos.js'
import { PageHeader, Button, Card, Input, Select, Spinner, Pill } from '../components/ui.jsx'

const ANIOS = ['7', '8', '9', '10', '11']
const ANIO_LABEL = { '7': '7° año', '8': '8° año', '9': '9° año', '10': '10° año', '11': '11° año' }

let contador = 0
function nuevoId() { return `m-${Date.now()}-${contador++}` }

export default function MallaPage() {
  const [cargando, setCargando] = useState(true)
  const [materias, setMaterias] = useState([])
  const [mallas, setMallas] = useState({})
  const [anioActivo, setAnioActivo] = useState('7')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    async function cargar() {
      const [mat, mal] = await Promise.all([listarMaterias(), obtenerMallas()])
      setMaterias(mat)
      setMallas(mal)
      setCargando(false)
    }
    cargar()
  }, [])

  const filas = mallas[anioActivo] || []

  function actualizarFilas(nuevasFilas) {
    setMallas(prev => ({ ...prev, [anioActivo]: nuevasFilas }))
    setGuardado(false)
  }

  function agregarFila() {
    if (materias.length === 0) return
    const materiaYaUsada = new Set(filas.map(f => f.materiaId))
    const disponible = materias.find(m => !materiaYaUsada.has(m.id)) || materias[0]
    actualizarFilas([...filas, { id: nuevoId(), materiaId: disponible.id, leccionesPorSemana: 2, bloqueContinuo: false }])
  }

  function actualizarFila(id, cambios) {
    actualizarFilas(filas.map(f => (f.id === id ? { ...f, ...cambios } : f)))
  }

  function quitarFila(id) {
    actualizarFilas(filas.filter(f => f.id !== id))
  }

  async function guardar() {
    setGuardando(true)
    await guardarMalla(anioActivo, filas)
    setGuardando(false)
    setGuardado(true)
  }

  const totalLecciones = filas.reduce((sum, f) => sum + (Number(f.leccionesPorSemana) || 0), 0)

  if (cargando) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Malla curricular"
        subtitle="Definí cuántas lecciones por semana de cada materia le corresponden a cada año (no por sección)."
        action={
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
          </Button>
        }
      />
      <div className="px-10 py-8 max-w-2xl">
        {materias.length === 0 && (
          <div className="mb-6 px-4 py-3 rounded-md bg-clay-50 border border-clay-200 text-sm text-clay-800">
            Todavía no hay materias creadas. Agregá materias primero para poder armar la malla.
          </div>
        )}

        <div className="flex gap-1.5 mb-6">
          {ANIOS.map(a => (
            <Pill key={a} tone="ink" active={anioActivo === a} onClick={() => { setAnioActivo(a); setGuardado(false) }}>
              {ANIO_LABEL[a]}
            </Pill>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1fr_6rem_9rem_2.5rem] gap-3 px-4 py-2.5 bg-ink-50 text-xs font-semibold text-ink-500 uppercase tracking-wide">
            <span>Materia</span>
            <span>Lecc./sem.</span>
            <span>Seguidas el mismo día</span>
            <span></span>
          </div>
          <div className="divide-y divide-ink-100">
            {filas.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-400 italic">Sin materias en la malla de {ANIO_LABEL[anioActivo]} todavía.</p>
            ) : filas.map(f => (
              <div key={f.id} className="grid grid-cols-[1fr_6rem_9rem_2.5rem] gap-3 px-4 py-2.5 items-center">
                <Select value={f.materiaId} onChange={e => actualizarFila(f.id, { materiaId: e.target.value })}>
                  {materias.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </Select>
                <Input
                  type="number" min="1" max="20"
                  value={f.leccionesPorSemana}
                  onChange={e => actualizarFila(f.id, { leccionesPorSemana: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => actualizarFila(f.id, { bloqueContinuo: !f.bloqueContinuo })}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    f.bloqueContinuo
                      ? 'bg-clay-500 text-white border-clay-500'
                      : 'bg-white text-ink-500 border-ink-200 hover:border-ink-400'
                  }`}
                  title="Si está activo, todas las lecciones de la semana se dan seguidas, el mismo día"
                >
                  {f.bloqueContinuo ? 'Sí, todas juntas' : 'No, se reparten'}
                </button>
                <button onClick={() => quitarFila(f.id)} className="text-ink-300 hover:text-clay-600">✕</button>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex items-center justify-between mt-3">
          <button onClick={agregarFila} disabled={materias.length === 0} className="text-sm font-medium text-sage-700 hover:text-sage-800 disabled:opacity-40">
            + Agregar materia a la malla
          </button>
          <p className="text-sm text-ink-500">
            Total: <span className="font-semibold text-ink-800">{totalLecciones}</span> lecciones/semana
          </p>
        </div>
      </div>
    </div>
  )
}

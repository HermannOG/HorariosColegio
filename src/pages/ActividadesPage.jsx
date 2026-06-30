import { useEffect, useState } from 'react'
import { listarActividades, crearActividad, actualizarActividad, eliminarActividad } from '../lib/datos.js'
import { PageHeader, Button, Card, Input, Spinner, EmptyState } from '../components/ui.jsx'

const actividadVacia = () => ({ nombre: '', leccionesPorSemana: 2, bloqueContinuo: false, puedeAtravesarAlmuerzo: false })

export default function ActividadesPage() {
  const [cargando, setCargando] = useState(true)
  const [actividades, setActividades] = useState([])
  const [nueva, setNueva] = useState(actividadVacia())
  const [creando, setCreando] = useState(false)

  async function recargar() {
    setActividades(await listarActividades())
  }

  useEffect(() => {
    recargar().then(() => setCargando(false))
  }, [])

  async function agregar(e) {
    e.preventDefault()
    if (!nueva.nombre.trim()) return
    setCreando(true)
    await crearActividad({
      nombre: nueva.nombre.trim(),
      leccionesPorSemana: Number(nueva.leccionesPorSemana) || 1,
      bloqueContinuo: !!nueva.bloqueContinuo,
      puedeAtravesarAlmuerzo: !!nueva.puedeAtravesarAlmuerzo,
    })
    setNueva(actividadVacia())
    await recargar()
    setCreando(false)
  }

  async function actualizarCampo(act, cambios) {
    const datos = { ...cambios }
    // Si se desactiva bloqueContinuo, no tiene sentido seguir permitiendo
    // atravesar el almuerzo (esa bandera solo aplica a bloques continuos).
    if ('bloqueContinuo' in datos && !datos.bloqueContinuo) {
      datos.puedeAtravesarAlmuerzo = false
    }
    setActividades(prev => prev.map(a => (a.id === act.id ? { ...a, ...datos } : a)))
    await actualizarActividad(act.id, datos)
  }

  async function eliminar(id) {
    await eliminarActividad(id)
    await recargar()
  }

  return (
    <div>
      <PageHeader
        title="Actividades"
        subtitle="Tareas que un profesor hace para el colegio (comités, coordinaciones, etc.) y que no son clase a ningún grupo. Mientras duran, el profesor queda ocupado, pero no aparecen en el horario de ninguna sección — solo en el horario del profesor."
      />
      <div className="px-10 py-8 max-w-3xl">
        <Card className="p-5 mb-8">
          <form onSubmit={agregar} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[12rem]">
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Nombre de la actividad</label>
              <Input
                value={nueva.nombre}
                onChange={e => setNueva(n => ({ ...n, nombre: e.target.value }))}
                placeholder="Ej: Comité de evaluación"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Lecc./sem.</label>
              <Input
                type="number" min="1" max="20" className="w-24"
                value={nueva.leccionesPorSemana}
                onChange={e => setNueva(n => ({ ...n, leccionesPorSemana: e.target.value }))}
              />
            </div>
            <BotonBloqueContinuo
              activo={nueva.bloqueContinuo}
              onClick={() => setNueva(n => ({ ...n, bloqueContinuo: !n.bloqueContinuo, puedeAtravesarAlmuerzo: n.bloqueContinuo ? false : n.puedeAtravesarAlmuerzo }))}
            />
            {nueva.bloqueContinuo && (
              <BotonAtraviesaAlmuerzo
                activo={nueva.puedeAtravesarAlmuerzo}
                onClick={() => setNueva(n => ({ ...n, puedeAtravesarAlmuerzo: !n.puedeAtravesarAlmuerzo }))}
              />
            )}
            <Button type="submit" disabled={creando}>Agregar</Button>
          </form>
          <p className="text-xs text-ink-400 mt-3">
            «Seguidas el mismo día» funciona igual que en la malla curricular (ej. Tecnología): si está activo, todas las lecciones de la semana se dan juntas, el mismo día.
          </p>
        </Card>

        {cargando ? <Spinner /> : actividades.length === 0 ? (
          <EmptyState
            title="Todavía no hay actividades"
            description="Agregá la primera actividad con el formulario de arriba."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-[1fr_6rem_9rem_9rem_2.5rem] gap-3 px-4 py-2.5 bg-ink-50 text-xs font-semibold text-ink-500 uppercase tracking-wide">
              <span>Nombre</span>
              <span>Lecc./sem.</span>
              <span>Seguidas el mismo día</span>
              <span>Atraviesa almuerzo</span>
              <span></span>
            </div>
            <div className="divide-y divide-ink-100">
              {actividades.map(a => (
                <div key={a.id} className="grid grid-cols-[1fr_6rem_9rem_9rem_2.5rem] gap-3 px-4 py-2.5 items-center">
                  <Input
                    value={a.nombre}
                    onChange={e => actualizarCampo(a, { nombre: e.target.value })}
                  />
                  <Input
                    type="number" min="1" max="20"
                    value={a.leccionesPorSemana}
                    onChange={e => actualizarCampo(a, { leccionesPorSemana: Number(e.target.value) || 1 })}
                  />
                  <BotonBloqueContinuo
                    activo={a.bloqueContinuo}
                    onClick={() => actualizarCampo(a, { bloqueContinuo: !a.bloqueContinuo })}
                  />
                  {a.bloqueContinuo ? (
                    <BotonAtraviesaAlmuerzo
                      activo={a.puedeAtravesarAlmuerzo}
                      onClick={() => actualizarCampo(a, { puedeAtravesarAlmuerzo: !a.puedeAtravesarAlmuerzo })}
                    />
                  ) : <span className="text-xs text-ink-300 text-center">—</span>}
                  <button onClick={() => eliminar(a.id)} className="text-ink-300 hover:text-clay-600" title="Eliminar actividad">✕</button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function BotonBloqueContinuo({ activo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
        activo ? 'bg-clay-500 text-white border-clay-500' : 'bg-white text-ink-500 border-ink-200 hover:border-ink-400'
      }`}
      title="Si está activo, todas las lecciones de la semana se dan seguidas, el mismo día"
    >
      {activo ? 'Sí, todas juntas' : 'No, se reparten'}
    </button>
  )
}

function BotonAtraviesaAlmuerzo({ activo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
        activo ? 'bg-sage-600 text-white border-sage-600' : 'bg-white text-ink-500 border-ink-200 hover:border-ink-400'
      }`}
      title="Si está activo, el bloque continuo puede cruzar el almuerzo; si no, debe quedar contenido antes o después"
    >
      {activo ? 'Puede cruzar' : 'No cruza'}
    </button>
  )
}

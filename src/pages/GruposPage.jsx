import { useEffect, useState } from 'react'
import { listarGrupos, crearGrupo, eliminarGrupo } from '../lib/datos.js'
import { PageHeader, Button, Card, Input, Spinner, EmptyState } from '../components/ui.jsx'

const ANIOS = ['7', '8', '9', '10', '11']

export default function GruposPage() {
  const [cargando, setCargando] = useState(true)
  const [grupos, setGrupos] = useState([])
  const [anio, setAnio] = useState('7')
  const [secciones, setSecciones] = useState('1')
  const [creando, setCreando] = useState(false)

  async function recargar() {
    setGrupos(await listarGrupos())
  }

  useEffect(() => {
    recargar().then(() => setCargando(false))
  }, [])

  // Crea de una vez todas las secciones de un año, ej: año=9, secciones=6 -> 9-1 ... 9-6
  async function agregarSecciones(e) {
    e.preventDefault()
    const cantidad = parseInt(secciones, 10)
    if (!cantidad || cantidad < 1) return
    setCreando(true)
    const existentes = new Set(grupos.filter(g => g.anio === anio).map(g => g.seccion))
    for (let s = 1; s <= cantidad; s++) {
      const seccionStr = String(s)
      if (existentes.has(seccionStr)) continue // no duplicar
      await crearGrupo({ anio, seccion: seccionStr, nombre: `${anio}-${seccionStr}` })
    }
    await recargar()
    setCreando(false)
  }

  async function eliminar(id) {
    await eliminarGrupo(id)
    await recargar()
  }

  const gruposPorAnio = ANIOS.map(a => ({
    anio: a,
    grupos: grupos.filter(g => g.anio === a).sort((x, y) => Number(x.seccion) - Number(y.seccion)),
  })).filter(g => g.grupos.length > 0 || g.anio === anio)

  return (
    <div>
      <PageHeader
        title="Grupos"
        subtitle="Definí cuántas secciones hay en cada año. Se puede ajustar cada año según cómo cambie la matrícula."
      />
      <div className="px-10 py-8 max-w-2xl">
        <Card className="p-5 mb-8">
          <form onSubmit={agregarSecciones} className="flex items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Año</label>
              <select
                value={anio}
                onChange={e => setAnio(e.target.value)}
                className="px-3 py-2 rounded-md border border-ink-200 text-sm bg-white"
              >
                {ANIOS.map(a => <option key={a} value={a}>{a}° año</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Cantidad de secciones</label>
              <Input type="number" min="1" max="20" value={secciones} onChange={e => setSecciones(e.target.value)} className="w-28" />
            </div>
            <Button type="submit" disabled={creando}>Crear grupos</Button>
          </form>
          <p className="text-xs text-ink-400 mt-3">
            Por ejemplo: año <strong>9</strong> con <strong>6</strong> secciones crea 9-1, 9-2, 9-3, 9-4, 9-5 y 9-6.
          </p>
        </Card>

        {cargando ? <Spinner /> : grupos.length === 0 ? (
          <EmptyState title="Todavía no hay grupos" description="Creá el primer conjunto de secciones arriba." />
        ) : (
          <div className="space-y-5">
            {gruposPorAnio.filter(g => g.grupos.length > 0).map(({ anio, grupos }) => (
              <div key={anio}>
                <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">{anio}° año</h3>
                <div className="flex flex-wrap gap-2">
                  {grupos.map(g => (
                    <span key={g.id} className="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full border border-ink-200 bg-white text-sm text-ink-700">
                      {g.nombre}
                      <button onClick={() => eliminar(g.id)} className="text-ink-300 hover:text-clay-600" title="Eliminar grupo">✕</button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import {
  listarProfesores, listarGrupos, listarMaterias, obtenerGrilla,
  obtenerHorarioActual, guardarHorario, obtenerMallas, DIAS,
} from '../lib/datos.js'
import { generarHorario } from '../lib/generador.js'
import { PageHeader, Button, Card, Select, Spinner, EmptyState, Pill } from '../components/ui.jsx'

const DIAS_LABEL = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' }

export default function HorarioPage() {
  const [cargando, setCargando] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [profesores, setProfesores] = useState([])
  const [grupos, setGrupos] = useState([])
  const [materias, setMaterias] = useState([])
  const [bloques, setBloques] = useState([])
  const [mallas, setMallas] = useState({})
  const [horario, setHorario] = useState({ asignaciones: [], conflictos: [] })
  const [vista, setVista] = useState('profesor') // 'profesor' | 'grupo'
  const [seleccionId, setSeleccionId] = useState('')
  const [modoReparto, setModoReparto] = useState('parejo') // 'parejo' | 'temprano'

  async function cargarTodo() {
    const [profs, gr, mat, grilla, hor, malla] = await Promise.all([
      listarProfesores(), listarGrupos(), listarMaterias(), obtenerGrilla(), obtenerHorarioActual(), obtenerMallas(),
    ])
    setProfesores(profs)
    setGrupos(gr)
    setMaterias(mat)
    setBloques(grilla.bloques)
    setHorario(hor)
    setMallas(malla)
    if (profs.length > 0) setSeleccionId(profs[0].id)
  }

  useEffect(() => {
    cargarTodo().then(() => setCargando(false))
  }, [])

  // Devuelve solo los profesores con asignaciones VÁLIDAS según la malla actual
  // (la materia debe existir en la malla del año correspondiente al grupo), y
  // además RESINCRONIZA leccionesPorSemana y bloqueContinuo tomándolos directo
  // de la malla vigente — así, si la malla cambió después de guardar al
  // profesor (más lecciones, o se activó "bloque continuo"), el generador
  // siempre usa el valor más reciente, sin depender de lo que haya quedado
  // grabado en la asignación del profesor.
  // También devuelve la lista de asignaciones descartadas, para avisar.
  function filtrarAsignacionesContraMalla(listaProfesores) {
    const descartadas = []
    const profesoresFiltrados = listaProfesores.map(prof => {
      const asignacionesValidas = (prof.asignaciones || [])
        .map(asig => {
          const grupo = grupos.find(g => g.id === asig.grupoId)
          if (!grupo) return null
          const filasMalla = mallas[grupo.anio] || []
          const filaMalla = filasMalla.find(f => f.materiaId === asig.materiaId)
          if (!filaMalla) {
            descartadas.push({
              profesorNombre: prof.nombre,
              grupoNombre: grupo.nombre,
              materiaId: asig.materiaId,
            })
            return null
          }
          return {
            ...asig,
            leccionesPorSemana: Number(filaMalla.leccionesPorSemana) || 0,
            bloqueContinuo: !!filaMalla.bloqueContinuo,
          }
        })
        .filter(Boolean)
      return { ...prof, asignaciones: asignacionesValidas }
    })
    return { profesoresFiltrados, descartadas }
  }

  async function generar() {
    setGenerando(true)
    const grilla = await obtenerGrilla()
    const { profesoresFiltrados, descartadas } = filtrarAsignacionesContraMalla(profesores)
    const resultado = generarHorario({ profesores: profesoresFiltrados, dias: DIAS, bloques: grilla.bloques, modoReparto })
    resultado.asignacionesDescartadas = descartadas
    await guardarHorario(resultado)
    setHorario(resultado)
    setGenerando(false)
  }

  const mapaMaterias = Object.fromEntries(materias.map(m => [m.id, m.nombre]))
  const mapaGrupos = Object.fromEntries(grupos.map(g => [g.id, g.nombre]))
  const mapaProfesores = Object.fromEntries(profesores.map(p => [p.id, p.nombre]))

  const listaSeleccion = vista === 'profesor' ? profesores : grupos

  // Compara, para cada grupo, lo que pide la malla de su año contra lo que
  // realmente quedó asignado a profesores (sumando todas las asignaciones de
  // ese grupo+materia entre todos los profesores).
  const huecosMalla = calcularHuecosMalla({ profesores, grupos, mallas, mapaMaterias })

  if (cargando) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Horario"
        subtitle="Generá el horario automáticamente a partir de los profesores, grupos y materias cargados."
        action={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-ink-400 mb-1">Reparto de lecciones impares</p>
              <div className="flex gap-1.5">
                <Pill tone="ink" active={modoReparto === 'parejo'} onClick={() => setModoReparto('parejo')}>Parejo entre días</Pill>
                <Pill tone="ink" active={modoReparto === 'temprano'} onClick={() => setModoReparto('temprano')}>Salir temprano</Pill>
              </div>
            </div>
            <Button onClick={generar} disabled={generando || profesores.length === 0}>
              {generando ? 'Generando…' : 'Generar horario'}
            </Button>
          </div>
        }
      />

      <div className="px-10 py-8">
        {profesores.length === 0 ? (
          <EmptyState
            title="Todavía no hay nada para generar"
            description="Agregá al menos un profesor con sus asignaciones antes de generar el horario."
          />
        ) : (
          <>
            {horario.asignacionesDescartadas?.length > 0 && (
              <AvisoDescartadas descartadas={horario.asignacionesDescartadas} mapaMaterias={mapaMaterias} />
            )}
            {huecosMalla.length > 0 && <AvisoHuecosMalla huecos={huecosMalla} />}

            {horario.generadoEn && (
              <ResumenGeneracion horario={horario} mapaProfesores={mapaProfesores} mapaGrupos={mapaGrupos} mapaMaterias={mapaMaterias} />
            )}

            <div className="flex items-center gap-3 mb-5 mt-2">
              <div className="flex gap-1.5">
                <Pill tone="ink" active={vista === 'profesor'} onClick={() => { setVista('profesor'); setSeleccionId(profesores[0]?.id || '') }}>Por profesor</Pill>
                <Pill tone="ink" active={vista === 'grupo'} onClick={() => { setVista('grupo'); setSeleccionId(grupos[0]?.id || '') }}>Por grupo</Pill>
              </div>
              <Select value={seleccionId} onChange={e => setSeleccionId(e.target.value)} className="max-w-xs">
                {listaSeleccion.map(item => (
                  <option key={item.id} value={item.id}>{item.nombre}</option>
                ))}
              </Select>
            </div>

            {!horario.generadoEn ? (
              <EmptyState title="Aún no generaste un horario" description="Hacé clic en «Generar horario» arriba para crear la primera versión." />
            ) : seleccionId ? (
              <TablaHorario
                bloques={bloques}
                asignaciones={horario.asignaciones}
                modo={vista}
                idSeleccionado={seleccionId}
                mapaMaterias={mapaMaterias}
                mapaGrupos={mapaGrupos}
                mapaProfesores={mapaProfesores}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function AvisoDescartadas({ descartadas, mapaMaterias }) {
  return (
    <div className="mb-4 px-4 py-3 rounded-md bg-clay-50 border border-clay-200 text-sm text-clay-800">
      <p className="font-medium mb-2">
        {descartadas.length} asignación(es) se ignoraron porque ya no están en la malla curricular:
      </p>
      <ul className="space-y-1 text-clay-700">
        {descartadas.map((d, i) => (
          <li key={i}>
            · {d.profesorNombre} — {mapaMaterias[d.materiaId] || '—'} con {d.grupoNombre}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-clay-600">
        Si esto es un error, revisá la malla curricular de ese año o quitá/ajustá la asignación del profesor.
      </p>
    </div>
  )
}

function calcularHuecosMalla({ profesores, grupos, mallas, mapaMaterias }) {
  // total[grupoId][materiaId] = lecciones ya asignadas a algún profesor
  const totalAsignado = {}
  profesores.forEach(p => {
    (p.asignaciones || []).forEach(a => {
      totalAsignado[a.grupoId] ??= {}
      totalAsignado[a.grupoId][a.materiaId] = (totalAsignado[a.grupoId][a.materiaId] || 0) + (Number(a.leccionesPorSemana) || 0)
    })
  })

  const huecos = []
  grupos.forEach(g => {
    const filasMalla = mallas[g.anio] || []
    filasMalla.forEach(fila => {
      const requerido = Number(fila.leccionesPorSemana) || 0
      const asignado = totalAsignado[g.id]?.[fila.materiaId] || 0
      if (asignado !== requerido) {
        huecos.push({
          grupoNombre: g.nombre,
          materiaNombre: mapaMaterias[fila.materiaId] || '—',
          requerido,
          asignado,
        })
      }
    })
  })
  return huecos
}

function AvisoHuecosMalla({ huecos }) {
  return (
    <div className="mb-6 px-4 py-3 rounded-md bg-clay-50 border border-clay-200 text-sm text-clay-800">
      <p className="font-medium mb-2">{huecos.length} materia(s) no coinciden con la malla curricular:</p>
      <ul className="space-y-1 text-clay-700">
        {huecos.map((h, i) => (
          <li key={i}>
            · {h.grupoNombre} — {h.materiaNombre}: asignado {h.asignado} de {h.requerido} lecc./sem.
            {h.asignado < h.requerido ? ' (falta profesor o lecciones)' : ' (hay de más)'}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-clay-600">
        Revisalo en «Profesores» o «Malla curricular» antes de generar, o generá igual y ajustá después.
      </p>
    </div>
  )
}

function ResumenGeneracion({ horario, mapaProfesores, mapaGrupos, mapaMaterias }) {
  const hayConflictos = horario.conflictos?.length > 0
  return (
    <div className={`mb-6 px-4 py-3 rounded-md border text-sm ${hayConflictos ? 'bg-clay-50 border-clay-200 text-clay-800' : 'bg-sage-50 border-sage-200 text-sage-800'}`}>
      {hayConflictos ? (
        <div>
          <p className="font-medium mb-2">{horario.conflictos.length} lección(es) no se pudieron ubicar sin choques:</p>
          <ul className="space-y-1 text-clay-700">
            {horario.conflictos.map((c, i) => (
              <li key={i}>
                · {mapaProfesores[c.profesorId] || '—'} — {mapaMaterias[c.materiaId] || '—'} con {mapaGrupos[c.grupoId] || '—'}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Todas las lecciones se ubicaron sin choques de horario.</p>
      )}
    </div>
  )
}

function TablaHorario({ bloques, asignaciones, modo, idSeleccionado, mapaMaterias, mapaGrupos, mapaProfesores }) {
  function celda(dia, bloqueId) {
    return asignaciones.find(a => {
      if (a.dia !== dia || a.bloqueId !== bloqueId) return false
      return modo === 'profesor' ? a.profesorId === idSeleccionado : a.grupoId === idSeleccionado
    })
  }

  return (
    <Card className="overflow-hidden overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[760px]">
        <thead>
          <tr className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
            <th className="px-3 py-2.5 text-left font-semibold w-40">Hora</th>
            <th className="px-3 py-2.5 text-left font-semibold w-12">Lecc.</th>
            {DIAS.map(d => (
              <th key={d} className="px-3 py-2.5 text-left font-semibold">{DIAS_LABEL[d]}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {bloques.map(b => {
            if (b.tipo !== 'clase') {
              return (
                <tr key={b.id} className="stripe-bg bg-ink-50">
                  <td className="px-3 py-2 text-ink-400 text-xs whitespace-nowrap">{b.horaInicio} – {b.horaFin}</td>
                  <td colSpan={DIAS.length + 1} className="px-3 py-2 text-center text-ink-500 font-medium text-xs uppercase tracking-wide">
                    {b.etiqueta}
                  </td>
                </tr>
              )
            }
            return (
              <tr key={b.id}>
                <td className="px-3 py-2 text-ink-400 text-xs whitespace-nowrap">{b.horaInicio} – {b.horaFin}</td>
                <td className="px-3 py-2 text-ink-600 font-semibold">{b.numero}</td>
                {DIAS.map(dia => {
                  const a = celda(dia, b.id)
                  return (
                    <td key={dia} className="px-3 py-2 align-top">
                      {a ? (
                        <div>
                          <p className="font-medium text-ink-900">{mapaMaterias[a.materiaId]}</p>
                          <p className="text-xs text-ink-400">
                            {modo === 'profesor' ? mapaGrupos[a.grupoId] : mapaProfesores[a.profesorId]}
                          </p>
                        </div>
                      ) : (
                        <span className="text-ink-200">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

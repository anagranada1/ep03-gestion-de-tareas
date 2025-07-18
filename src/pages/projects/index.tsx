// src/pages/projects/index.tsx

// Página de gestión de proyectos
// Accesible solo para administradores y project managers

import React, { useState } from 'react'
import prisma from '@/config/prisma'
import { withAuth, UserPayload } from '@/lib/auth'
import Layout from '@/components/Organisms/Layout'
import Table, { Column } from '@/components/Molecules/Table'
import Modal from '@/components/Molecules/Modal'
import ProjectForm, { ProjectFormData } from '@/components/Molecules/ProjectForm'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

// Estructura de cada proyecto en la tabla
type ProjectItem = {
  id:             string
  name:           string
  description:    string | null
  assignedToId:   string
  assignedToName: string
  createdAt:      string
}

// Carga proyectos y usuarios desde la base de datos
// Protegido por middleware de autenticación y roles
export const getServerSideProps = withAuth(
  async () => {
    // 1) Traemos proyectos con su relación assignedTo
    const projs = await prisma.project.findMany({
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            profile: { select: { avatarUrl: true } }
          }
        }
      }
    })

    // 2) Cargamos lista de usuarios para el <Select> de responsables
    const users = await prisma.user.findMany({
      include: { profile: { select: { avatarUrl: true } } }
    })

    // 3) Mappeamos al shape que queremos en la página
    const initialProjects: ProjectItem[] = projs.map(p => ({
      id:             p.id,
      name:           p.name,
      description:    p.description,
      assignedToId:   p.assignedTo?.id ?? '',       // si no hay asignado, queda vacío
      assignedToName: p.assignedTo?.name ?? '—',     // si no hay asignado, mostramos un guión
      createdAt:      (() => {
        const d   = p.createdAt
        const dd  = String(d.getDate()).padStart(2, '0')
        const mm  = String(d.getMonth() + 1).padStart(2, '0')
        const yyyy = d.getFullYear()
        return `${dd}/${mm}/${yyyy}`
      })(),
    }))

    const userList: UserPayload[] = users.map(u => ({
      id:        u.id,
      email:     u.email,
      role:      u.role,
      name:      u.name,
      avatarUrl: u.profile?.avatarUrl ?? null
    }))

    return {
      props: {
        initialProjects,
        users: userList
      }
    }
  },
  ['Administrator', 'Project_Manager']
)

// Página principal de proyectos
export default function ProjectsPage({
  user,
  initialProjects,
  users
}: {
  user: UserPayload
  initialProjects: ProjectItem[]
  users: UserPayload[]
}) {
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects)
  const [modal, setModal]       = useState<'create'|'edit'|'delete'|null>(null)
  const [selected, setSelected] = useState<ProjectItem|null>(null)
  const [form, setForm]         = useState<ProjectFormData>({
    name: '',
    description: '',
    assignedToId: ''
  })
  const { toast } = useToast()
  
  // Reinicia el formulario (para crear o editar)
  const resetForm = (p?: ProjectItem) => {
    if (p) {
      setForm({
        name:         p.name,
        description:  p.description ?? '',
        assignedToId: p.assignedToId
      })
      setSelected(p)
    } else {
      setForm({ name:'', description:'', assignedToId:'' })
      setSelected(null)
    }
  }

// Crear nuevo proyecto
const onCreate = async () => {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form)
  })
  if (!res.ok) {
    const err = await res.json()
    return toast({ title: 'Error', description: err.error })
  }

  //Consumimos el JSON “crudo” de la API
  const raw = await res.json()

  //Helper para formatear la fecha a DD/MM/YYYY
  const formatDate = (iso: string) => {
    const d  = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  //Lo mapeamos al tipo ProjectItem
  const newProject: ProjectItem = {
    id:              raw.id,
    name:            raw.name,
    description:     raw.description,
    assignedToId:    raw.assignedTo?.id   ?? '',
    assignedToName:  raw.assignedTo?.name ?? '',
    createdAt:       formatDate(raw.createdAt),
  }

  //Lo añadimos al estado
  setProjects(prev => [...prev, newProject])
  setModal(null)
  toast({ title: 'Proyecto creado' })
}

  // Actualizar proyecto existente
  const onUpdate = async () => {
    if (!selected) return
    const res = await fetch(`/api/projects/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    if (!res.ok) {
      const err = await res.json()
      return toast({ title: 'Error', description: err.error })
    }
    setProjects(prev =>
      prev.map(x =>
        x.id === selected.id
          ? {
              ...x,
              name:           form.name,
              description:    form.description,
              assignedToId:   form.assignedToId,
              assignedToName: // volvemos a tomar el nombre del `users` list
                users.find(u => u.id === form.assignedToId)?.name ?? '—',
            }
          : x
      )
    )
    setModal(null)
    toast({ title: 'Proyecto actualizado' })
  }

  // Eliminar proyecto
  const onDelete = async () => {
    if (!selected) return
    const res = await fetch(`/api/projects/${selected.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      return toast({ title: 'Error', description: err.error })
    }
    setProjects(prev => prev.filter(x => x.id !== selected.id))
    setModal(null)
    toast({ title: 'Proyecto eliminado' })
  }

  // Columnas de la tabla de proyectos
  const columns: Column<ProjectItem>[] = [
    { key:'name',           label:'Proyecto',    type:'text'   },
    { key:'assignedToName', label:'Responsable', type:'text'   },
    { key:'description',    label:'Descripción', type:'text'   },
    { key:'createdAt',      label:'Creado',      type:'text'   },
    { key:'actions',        label:'Acciones',    type:'actions'}
  ]

  // Render del layout y los componentes visuales
  return (
    <Layout user={user} childrenTitle="Proyectos" childrenSubitle="Administra los proyectos">
      {/* Header */}
      <section className="absolute mb-8 pt-2 w-full max-w-md mx-auto">
        <Button
          onClick={() => { resetForm(); setModal('create') }}
          className="absolute mt-2 bg-blue-500 hover:bg-blue-600 text-white shadow-md cursor-pointer"
        >
          <Plus className="mr-2" /> Nuevo proyecto
        </Button>
      </section>
      <section className="mb-6 mt-15 w-full">
        <Table<ProjectItem>
          columns={columns}
          data={projects}
          onEdit={p    => { resetForm(p);    setModal('edit') }}
          onDelete={p  => { resetForm(p);    setModal('delete') }}
        />
      </section>

      {/* Modal Crear */}
      <Modal
        isOpen={modal==='create'}
        onClose={()=>setModal(null)}
        title="Crear Proyecto"
        subtitle="Rellena el formulario"
        primaryButtonText="Crear"
        onPrimaryAction={onCreate}
      >
        <ProjectForm data={form} onChange={setForm} users={users} />
      </Modal>

      {/* Modal Editar */}
      <Modal
        isOpen={modal==='edit'}
        onClose={()=>setModal(null)}
        title="Editar Proyecto"
        subtitle="Actualiza los datos"
        primaryButtonText="Actualizar"
        onPrimaryAction={onUpdate}
      >
        <ProjectForm data={form} onChange={setForm} users={users} />
      </Modal>

      {/* Modal Eliminar */}
      <Modal
        isOpen={modal==='delete'}
        onClose={()=>setModal(null)}
        title={`Eliminar proyecto "${selected?.name}"?`}
        subtitle="Esta acción no se puede deshacer."
        primaryButtonText="Eliminar"
        primaryButtonVariant="destructive"
        onPrimaryAction={onDelete}
      >
        <p className="text-sm text-gray-600">
          El proyecto será eliminado permanentemente.
        </p>
      </Modal>
    </Layout>
  )
}

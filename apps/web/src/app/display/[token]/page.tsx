'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './display.module.css'

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

type DisplayData = {
  groupId: string
  label: string
  volume: number
  appointments: Array<{
    id: string
    title: string
    startTime: string
    location?: string | null
    assignee?: { email: string } | null
  }>
  recurringTasks: Array<{
    id: string
    title: string
    scheduledTime: string
    alarmEnabled: boolean
    volume: number
    snoozeInterval: number
    maxSnoozes: number
  }>
  serverTime: string
}

type AlarmTask = DisplayData['recurringTasks'][0]

export default function DisplayPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<DisplayData | null>(null)
  const [now, setNow] = useState(new Date())
  const [alarm, setAlarm] = useState<AlarmTask | null>(null)
  const [wellDone, setWellDone] = useState(false)
  const [snoozeCount, setSnoozeCount] = useState(0)
  const [error, setError] = useState('')
  const alarmContextRef = useRef<AudioContext | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/display/${params.token}`)
      if (!res.ok) {
        setError('Ogiltig skärmtoken')
        return
      }
      const json: DisplayData = await res.json()
      setData(json)
    } catch {
      setError('Kunde inte hämta data')
    }
  }, [params.token])

  useEffect(() => {
    fetchData()
    const poll = setInterval(fetchData, 60_000)
    return () => clearInterval(poll)
  }, [fetchData])

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (!data) return
    const checkAlarms = () => {
      const current = new Date()
      for (const task of data.recurringTasks) {
        if (!task.alarmEnabled) continue
        const [h, m] = task.scheduledTime.split(':').map(Number)
        const scheduled = new Date(current)
        scheduled.setHours(h!, m!, 0, 0)
        const diff = Math.abs(current.getTime() - scheduled.getTime())
        if (diff < 60_000 && !alarm) {
          setAlarm(task)
          setSnoozeCount(0)
          playChime(task.volume)
        }
      }
    }
    const id = setInterval(checkAlarms, 10_000)
    return () => clearInterval(id)
  }, [data, alarm])

  function playChime(volume: number) {
    try {
      const ctx = new AudioContext()
      alarmContextRef.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 440
      gain.gain.setValueAtTime(volume / 100, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2)
      osc.start()
      osc.stop(ctx.currentTime + 2)
    } catch {}
  }

  async function confirmAlarm() {
    if (!alarm || !data) return
    try {
      await fetch(`${API_BASE}/api/display/${params.token}`, { method: 'GET' })
    } catch {}
    setAlarm(null)
    setWellDone(true)
    setTimeout(() => setWellDone(false), 3000)
  }

  function snoozeAlarm() {
    if (!alarm) return
    if (snoozeCount >= alarm.maxSnoozes) return
    setSnoozeCount((c) => c + 1)
    setAlarm(null)
    setTimeout(() => setAlarm(alarm), alarm.snoozeInterval * 60 * 1000)
  }

  const timeStr = now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })

  if (error) {
    return (
      <div className={styles.errorScreen}>
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.clock}>{timeStr}</div>
      <div className={styles.date}>{dateStr}</div>

      {wellDone && (
        <div className={styles.wellDone}>Bra gjort! 🎉</div>
      )}

      {alarm && (
        <div className={styles.alarmOverlay}>
          <div className={styles.alarmTitle}>{alarm.title}</div>
          <div className={styles.alarmTime}>Kl {alarm.scheduledTime}</div>
          <button className={styles.confirmBtn} onClick={confirmAlarm}>
            Klart!
          </button>
          {alarm.maxSnoozes > 0 && snoozeCount < alarm.maxSnoozes && (
            <button className={styles.snoozeBtn} onClick={snoozeAlarm}>
              Påminn mig om {alarm.snoozeInterval} min
            </button>
          )}
        </div>
      )}

      {data && (
        <div className={styles.panels}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Kommande besök</h2>
            {data.appointments.length === 0 ? (
              <p className={styles.noItems}>Inga besök planerade</p>
            ) : (
              <ul className={styles.appointmentList}>
                {data.appointments.map((apt) => (
                  <li key={apt.id} className={styles.appointmentItem}>
                    <span className={styles.aptTime}>
                      {new Date(apt.startTime).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={styles.aptTitle}>{apt.title}</span>
                    {apt.location && <span className={styles.aptLocation}>{apt.location}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Aktiviteter idag</h2>
            {data.recurringTasks.length === 0 ? (
              <p className={styles.noItems}>Inga aktiviteter</p>
            ) : (
              <ul className={styles.taskList}>
                {data.recurringTasks.map((task) => (
                  <li key={task.id} className={styles.taskItem}>
                    <span className={styles.taskTime}>{task.scheduledTime}</span>
                    <span className={styles.taskTitle}>{task.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

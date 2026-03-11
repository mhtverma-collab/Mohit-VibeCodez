import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon, 
  Settings, 
  ChevronRight, 
  ChevronLeft,
  GanttChart,
  Table as TableIcon,
  Download,
  Play,
  Clock,
  LayoutGrid,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { 
  format, 
  addDays, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  isWeekend,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  differenceInDays,
  startOfQuarter,
  addQuarters,
  getQuarter,
  startOfYear
} from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Task, calculateTaskDates } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [projectStartDate, setProjectStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [taskCountInput, setTaskCountInput] = useState(5);
  const [viewScale, setViewScale] = useState<'days' | 'weeks' | 'months' | 'quarters'>('days');
  const [viewDate, setViewDate] = useState(new Date());
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  const ganttRef = useRef<HTMLDivElement>(null);

  const exportToXML = () => {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n';
    const xmlFooter = '</Project>';
    
    let tasksXml = '  <Tasks>\n';
    tasks.forEach((task, i) => {
      tasksXml += `    <Task>
      <UID>${i}</UID>
      <ID>${task.index}</ID>
      <Name>${task.name}</Name>
      <Start>${task.startDate.toISOString()}</Start>
      <Finish>${task.endDate.toISOString()}</Finish>
      <Duration>PT${task.duration * 8}H0M0S</Duration>
      <Cost>${task.unitCost * task.duration}</Cost>
      <UnitCost>${task.unitCost}</UnitCost>
      <ManualStart>${task.startDate.toISOString()}</ManualStart>
      <ManualFinish>${task.endDate.toISOString()}</ManualFinish>
    </Task>\n`;
    });
    tasksXml += '  </Tasks>\n';

    const blob = new Blob([xmlHeader + tasksXml + xmlFooter], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project_schedule_${format(new Date(), 'yyyyMMdd')}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handlePrint = () => {
    window.print();
    setShowExportMenu(false);
  };

  // Initialize project
  const handleInitialize = () => {
    const start: Task = {
      id: 'start-milestone',
      index: 0,
      name: 'Project Start',
      quantity: 0,
      production: 0,
      duration: 0,
      overlap: 0,
      unitCost: 0,
      predecessorId: null,
      startDate: new Date(projectStartDate),
      endDate: new Date(projectStartDate),
      isMilestone: true,
    };

    const newTasks: Task[] = Array.from({ length: taskCountInput }).map((_, i) => ({
      id: crypto.randomUUID(),
      index: i + 1,
      name: `Task ${i + 1}`,
      quantity: 100,
      production: 10,
      duration: 10,
      overlap: 0,
      unitCost: 1000,
      predecessorId: i === 0 ? 'start-milestone' : null,
      startDate: new Date(projectStartDate),
      endDate: addDays(new Date(projectStartDate), 9),
      isMilestone: false,
    }));

    const allTasks = calculateTaskDates([start, ...newTasks], new Date(projectStartDate));
    setTasks(allTasks);
    setIsInitialized(true);
    setViewDate(new Date(projectStartDate));
  };

  // Update task data
  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks(prev => {
      const newTasks = prev.map(t => {
        if (t.id === id) {
          const updated = { ...t, ...updates };
          // Recalculate duration if quantity or production changes
          if ('quantity' in updates || 'production' in updates) {
            updated.duration = updated.production > 0 ? Math.ceil(updated.quantity / updated.production) : 0;
          }
          return updated;
        }
        return t;
      });
      return calculateTaskDates(newTasks, new Date(projectStartDate));
    });
  };

  const moveTask = (id: string, direction: 'up' | 'down') => {
    setTasks(prev => {
      const currentIndex = prev.findIndex(t => t.id === id);
      if (currentIndex === -1) return prev;
      if (direction === 'up' && currentIndex <= 1) return prev;
      if (direction === 'down' && currentIndex === prev.length - 1) return prev;
      if (direction === 'down' && currentIndex === 0) return prev;

      const newTasks = [...prev];
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      
      const [movedTask] = newTasks.splice(currentIndex, 1);
      newTasks.splice(targetIndex, 0, movedTask);

      const indexedTasks = newTasks.map((t, i) => ({ ...t, index: i }));
      
      // Update predecessor of the moved task to the one now above it
      const updatedMovedTask = indexedTasks[targetIndex];
      if (targetIndex > 0) {
        updatedMovedTask.predecessorId = indexedTasks[targetIndex - 1].id;
      } else {
        updatedMovedTask.predecessorId = null;
      }

      return calculateTaskDates(indexedTasks, new Date(projectStartDate));
    });
  };

  // Gantt Chart Range
  const timelineDays = useMemo(() => {
    let startOffset = 0;
    let endOffset = 2;
    
    if (viewScale === 'months') {
      startOffset = 2;
      endOffset = 10;
    } else if (viewScale === 'quarters') {
      startOffset = 6;
      endOffset = 24;
    }

    const start = startOfWeek(subMonths(viewDate, startOffset));
    const end = endOfWeek(addMonths(viewDate, endOffset));
    return eachDayOfInterval({ start, end });
  }, [viewDate, viewScale]);

  const scaleConfig = useMemo(() => {
    switch (viewScale) {
      case 'weeks': return { unitWidth: 60, daysPerUnit: 7 };
      case 'months': return { unitWidth: 100, daysPerUnit: 30 };
      case 'quarters': return { unitWidth: 150, daysPerUnit: 91 };
      default: return { unitWidth: 24, daysPerUnit: 1 };
    }
  }, [viewScale]);

  const pixelsPerDay = useMemo(() => {
    switch (viewScale) {
      case 'weeks': return 60 / 7;
      case 'months': return 100 / 30;
      case 'quarters': return 150 / 91.25; // Approximate days in a quarter
      default: return 24;
    }
  }, [viewScale]);

  const months = useMemo(() => {
    const result: { date: Date; days: number }[] = [];
    if (timelineDays.length === 0) return result;
    
    const isYearly = viewScale === 'months' || viewScale === 'quarters';
    let currentGroup = isYearly ? startOfYear(timelineDays[0]) : startOfMonth(timelineDays[0]);
    let daysInGroup = 0;

    timelineDays.forEach(day => {
      const sameGroup = isYearly 
        ? day.getFullYear() === currentGroup.getFullYear()
        : day.getMonth() === currentGroup.getMonth() && day.getFullYear() === currentGroup.getFullYear();
        
      if (!sameGroup) {
        result.push({ date: currentGroup, days: daysInGroup });
        currentGroup = isYearly ? startOfYear(day) : startOfMonth(day);
        daysInGroup = 1;
      } else {
        daysInGroup++;
      }
    });
    result.push({ date: currentGroup, days: daysInGroup });
    return result;
  }, [timelineDays, viewScale]);

  const timelineHeaderUnits = useMemo(() => {
    if (viewScale === 'days') return timelineDays;
    
    const units: Date[] = [];
    if (viewScale === 'weeks') {
      let current = startOfWeek(timelineDays[0]);
      while (current <= timelineDays[timelineDays.length - 1]) {
        units.push(current);
        current = addDays(current, 7);
      }
    } else if (viewScale === 'months') {
      let current = startOfMonth(timelineDays[0]);
      while (current <= timelineDays[timelineDays.length - 1]) {
        units.push(current);
        current = addMonths(current, 1);
      }
    } else if (viewScale === 'quarters') {
      let current = startOfQuarter(timelineDays[0]);
      while (current <= timelineDays[timelineDays.length - 1]) {
        units.push(current);
        current = addQuarters(current, 1);
      }
    }
    return units;
  }, [timelineDays, viewScale]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl mb-4">
              <GanttChart size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">ProPlan Scheduler</h1>
            <p className="text-slate-500">Initialize your construction project schedule</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Project Start Date</label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="date" 
                  value={projectStartDate}
                  onChange={(e) => setProjectStartDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Number of Schedule Items</label>
              <div className="relative">
                <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="number" 
                  min="1"
                  max="50"
                  value={taskCountInput}
                  onChange={(e) => setTaskCountInput(parseInt(e.target.value) || 0)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                />
              </div>
            </div>

            <button 
              onClick={handleInitialize}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 group"
            >
              <Play size={18} className="group-hover:translate-x-0.5 transition-transform" />
              Create Project Schedule
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Top Ribbon / Toolbar */}
      <header className="h-14 border-bottom border-slate-200 bg-slate-50 flex items-center px-4 gap-6 shrink-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <GanttChart size={18} />
          </div>
          <span className="font-bold text-slate-800 tracking-tight">ProPlan</span>
        </div>

        <div className="h-8 w-px bg-slate-200 mx-2" />

        <nav className="flex items-center gap-1">
          <button className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-2">
            <TableIcon size={16} />
            Task
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-2"
            >
              <Download size={16} />
              Export
            </button>
            
            {showExportMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1">
                <button 
                  onClick={exportToXML}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Download size={14} className="text-slate-400" />
                  Export as XML (MS Project)
                </button>
                <button 
                  onClick={handlePrint}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Download size={14} className="text-slate-400" />
                  Save as PDF / Print
                </button>
              </div>
            )}
          </div>
          
          <div className="h-4 w-px bg-slate-300 mx-2" />
          
          <div className="flex items-center bg-slate-200/50 rounded-lg p-1 gap-1">
            {(['days', 'weeks', 'months', 'quarters'] as const).map((scale) => (
              <button
                key={scale}
                onClick={() => setViewScale(scale)}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-md transition-all capitalize",
                  viewScale === scale 
                    ? "bg-white text-indigo-600 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {scale}
              </button>
            ))}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex flex-col items-end">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Total Project Cost</div>
            <div className="text-sm font-bold text-emerald-600">
              ₹{tasks.reduce((sum, t) => sum + (t.unitCost * t.duration), 0).toLocaleString('en-IN')}
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex flex-col items-end">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Project Duration</div>
            <div className="text-sm font-bold text-indigo-600">
              {tasks.length > 0 ? (() => {
                const start = new Date(Math.min(...tasks.map(t => t.startDate.getTime())));
                const end = new Date(Math.max(...tasks.map(t => t.endDate.getTime())));
                return differenceInDays(end, start) + 1;
              })() : 0} Days
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-xs text-slate-500 font-medium">
            Project Start: <span className="text-slate-900">{format(new Date(projectStartDate), 'MMM dd, yyyy')}</span>
          </div>
          <button 
            onClick={() => setIsInitialized(false)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Task Table */}
        <div className="w-[1000px] border-r border-slate-200 flex flex-col shrink-0 bg-white">
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm border-collapse table-fixed">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-200 h-20">
                  <th className="w-16 p-2 text-left font-semibold text-slate-500 border-r border-slate-200 no-print">Move</th>
                  <th className="w-12 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">ID</th>
                  <th className="w-40 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">Task Name</th>
                  <th className="w-16 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">Qty</th>
                  <th className="w-16 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">Prod</th>
                  <th className="w-16 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">Dur</th>
                  <th className="w-20 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">Pred</th>
                  <th className="w-16 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">Over</th>
                  <th className="w-24 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">Unit Cost (₹/d)</th>
                  <th className="w-28 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">Total Cost (₹)</th>
                  <th className="w-24 p-2 text-left font-semibold text-slate-500 border-r border-slate-200">Start</th>
                  <th className="w-24 p-2 text-left font-semibold text-slate-500">End</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50 group h-9">
                    <td className="p-1 border-r border-slate-100 flex items-center justify-center gap-1 no-print h-full">
                      {task.index > 1 && (
                        <button 
                          onClick={() => moveTask(task.id, 'up')}
                          className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Move Up"
                        >
                          <ArrowUp size={14} />
                        </button>
                      )}
                      {task.index > 0 && task.index < tasks.length - 1 && (
                        <button 
                          onClick={() => moveTask(task.id, 'down')}
                          className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Move Down"
                        >
                          <ArrowDown size={14} />
                        </button>
                      )}
                    </td>
                    <td className="p-2 text-slate-400 font-mono text-xs border-r border-slate-100 text-center">
                      {task.index === 0 ? 'M' : task.index}
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      <span className="print-only px-2 py-1">{task.name}</span>
                      <input 
                        type="text"
                        value={task.name}
                        onChange={(e) => updateTask(task.id, { name: e.target.value })}
                        className={cn(
                          "w-full px-2 py-1 bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded outline-none truncate",
                          task.isMilestone && "font-bold text-indigo-700"
                        )}
                      />
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      {!task.isMilestone && (
                        <>
                          <span className="print-only px-1 py-1 text-right">{task.quantity}</span>
                          <input 
                            type="number"
                            value={task.quantity}
                            onChange={(e) => updateTask(task.id, { quantity: parseFloat(e.target.value) || 0 })}
                            className="w-full px-1 py-1 bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded outline-none text-right"
                          />
                        </>
                      )}
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      {!task.isMilestone && (
                        <>
                          <span className="print-only px-1 py-1 text-right">{task.production}</span>
                          <input 
                            type="number"
                            value={task.production}
                            onChange={(e) => updateTask(task.id, { production: parseFloat(e.target.value) || 0 })}
                            className="w-full px-1 py-1 bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded outline-none text-right"
                          />
                        </>
                      )}
                    </td>
                    <td className="p-2 text-right border-r border-slate-100 text-slate-600 font-medium">
                      {task.duration}d
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      {task.index > 0 && (
                        <>
                          <span className="print-only px-1 py-1 text-xs">
                            {tasks.find(t => t.id === task.predecessorId)?.index || ''}
                          </span>
                          <select 
                            value={task.predecessorId || ''}
                            onChange={(e) => updateTask(task.id, { predecessorId: e.target.value || null })}
                            className="w-full px-1 py-1 bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded outline-none text-xs"
                          >
                            <option value="">None</option>
                            {tasks.filter(t => t.id !== task.id).map(t => (
                              <option key={t.id} value={t.id}>{t.index === 0 ? 'Start' : t.index}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      {task.index > 0 && !task.isMilestone && (
                        <>
                          <span className="print-only px-1 py-1 text-right">{task.overlap}</span>
                          <input 
                            type="number"
                            value={task.overlap}
                            onChange={(e) => updateTask(task.id, { overlap: parseFloat(e.target.value) || 0 })}
                            className="w-full px-1 py-1 bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded outline-none text-right"
                          />
                        </>
                      )}
                    </td>
                    <td className="p-1 border-r border-slate-100">
                      {!task.isMilestone && (
                        <>
                          <span className="print-only px-1 py-1 text-right">{task.unitCost}</span>
                          <input 
                            type="number"
                            value={task.unitCost}
                            onChange={(e) => updateTask(task.id, { unitCost: parseFloat(e.target.value) || 0 })}
                            className="w-full px-1 py-1 bg-transparent border-none focus:ring-1 focus:ring-indigo-500 rounded outline-none text-right"
                          />
                        </>
                      )}
                    </td>
                    <td className="p-2 text-right border-r border-slate-100 text-emerald-600 font-bold">
                      {!task.isMilestone && `₹${(task.unitCost * task.duration).toLocaleString('en-IN')}`}
                    </td>
                    <td className="p-2 text-xs text-slate-500 whitespace-nowrap border-r border-slate-100">
                      {format(task.startDate, 'dd/MM/yy')}
                    </td>
                    <td className="p-2 text-xs text-slate-500 whitespace-nowrap">
                      {format(task.endDate, 'dd/MM/yy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
            <button 
              onClick={() => {
                const nextIndex = tasks.length;
                const newTask: Task = {
                  id: crypto.randomUUID(),
                  index: nextIndex,
                  name: `New Task ${nextIndex}`,
                  quantity: 100,
                  production: 10,
                  duration: 10,
                  overlap: 0,
                  unitCost: 1000,
                  predecessorId: tasks[tasks.length - 1].id,
                  startDate: new Date(),
                  endDate: new Date(),
                  isMilestone: false,
                };
                setTasks(prev => calculateTaskDates([...prev, newTask], new Date(projectStartDate)));
              }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5"
            >
              <Plus size={14} />
              Add Task
            </button>
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
              {tasks.length} Items Total
            </span>
          </div>
        </div>

        {/* Right: Gantt Chart */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          {/* Timeline Header */}
          <div className="h-20 border-b border-slate-200 bg-white flex flex-col shrink-0">
            {/* Top Level: Months (or Years if months view) */}
            <div className="flex-1 flex border-b border-slate-100">
              {months.map((month, i) => (
                <div 
                  key={i} 
                  className="border-r border-slate-100 flex items-center px-3 text-xs font-bold text-slate-600 uppercase tracking-tight overflow-hidden whitespace-nowrap"
                  style={{ width: `${month.days * pixelsPerDay}px` }}
                >
                  {format(month.date, (viewScale === 'months' || viewScale === 'quarters') ? 'yyyy' : 'MMMM yyyy')}
                </div>
              ))}
            </div>
            {/* Bottom Level: Days / Weeks / Months */}
            <div className="flex h-8">
              {timelineHeaderUnits.map((unit, i) => {
                let width = pixelsPerDay;
                let label = format(unit, 'd');
                let isHighlight = isSameDay(unit, new Date());
                let isMuted = isWeekend(unit);

                if (viewScale === 'weeks') {
                  width = 60;
                  label = `W${format(unit, 'w')}`;
                  isHighlight = false; // Simplified
                  isMuted = false;
                } else if (viewScale === 'months') {
                  width = 100;
                  label = format(unit, 'MMM');
                  isHighlight = false;
                  isMuted = false;
                } else if (viewScale === 'quarters') {
                  width = 150;
                  label = `Q${getQuarter(unit)} ${format(unit, 'yyyy')}`;
                  isHighlight = false;
                  isMuted = false;
                }

                return (
                  <div 
                    key={i} 
                    className={cn(
                      "shrink-0 border-r border-slate-100 flex items-center justify-center text-[10px] font-medium",
                      isMuted ? "bg-slate-50 text-slate-400" : "text-slate-600",
                      isHighlight && "bg-indigo-50 text-indigo-600 font-bold"
                    )}
                    style={{ width: `${width}px` }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline Body */}
          <div className="flex-1 overflow-auto relative" ref={ganttRef}>
            {/* Grid Lines */}
            <div className="absolute inset-0 flex pointer-events-none">
              {timelineHeaderUnits.map((unit, i) => {
                let width = pixelsPerDay;
                let isMuted = viewScale === 'days' && isWeekend(unit);
                if (viewScale === 'weeks') width = 60;
                if (viewScale === 'months') width = 100;
                if (viewScale === 'quarters') width = 150;

                return (
                  <div 
                    key={i} 
                    className={cn(
                      "shrink-0 border-r border-slate-200/50 h-full",
                      isMuted && "bg-slate-200/20"
                    )}
                    style={{ width: `${width}px` }}
                  />
                );
              })}
            </div>

            {/* Task Bars */}
            <div className="relative">
              {tasks.map((task) => {
                const daysFromStart = differenceInDays(task.startDate, timelineDays[0]);
                const durationDays = differenceInDays(task.endDate, task.startDate) + 1;
                
                // Calculate position based on pixelsPerDay
                const leftPos = daysFromStart * pixelsPerDay;
                const widthPos = durationDays * pixelsPerDay;
                
                return (
                  <div key={task.id} className="h-9 flex items-center relative group">
                    {task.isMilestone ? (
                      <div 
                        className="absolute w-4 h-4 bg-indigo-600 rotate-45 border-2 border-white shadow-sm z-10"
                        style={{ left: `${leftPos + (pixelsPerDay/2) - 8}px` }}
                        title={`${task.name}: ${format(task.startDate, 'MMM dd')}`}
                      />
                    ) : (
                      <div 
                        className="absolute h-5 bg-indigo-500 rounded-sm border border-indigo-600 shadow-sm flex items-center px-2 overflow-hidden group-hover:bg-indigo-400 transition-colors cursor-pointer"
                        style={{ 
                          left: `${leftPos}px`, 
                          width: `${widthPos}px` 
                        }}
                        title={`${task.name}: ${format(task.startDate, 'MMM dd')} - ${format(task.endDate, 'MMM dd')}`}
                      >
                        <span className="text-[9px] text-white font-bold truncate">
                          {task.name}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline Controls */}
          <div className="h-10 bg-white border-t border-slate-200 flex items-center px-4 gap-4">
            <button 
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="p-1 hover:bg-slate-100 rounded transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-slate-600">
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <button 
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="p-1 hover:bg-slate-100 rounded transition-colors"
            >
              <ChevronRight size={16} />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-3 h-3 bg-indigo-500 rounded-sm" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Task</span>
              <div className="w-3 h-3 bg-indigo-600 rotate-45 ml-2" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Milestone</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import { addDays, differenceInDays, isBefore, startOfDay } from 'date-fns';

export interface Task {
  id: string;
  index: number;
  name: string;
  quantity: number;
  production: number;
  duration: number;
  overlap: number;
  unitCost: number;
  predecessorId: string | null;
  startDate: Date;
  endDate: Date;
  isMilestone: boolean;
}

export interface ProjectSettings {
  startDate: Date;
  taskCount: number;
}

export const calculateTaskDates = (tasks: Task[], projectStartDate: Date): Task[] => {
  const updatedTasks = [...tasks];
  
  // Sort by index to ensure we process in logical order
  // However, predecessors might be out of order, so we might need a more robust approach
  // For this simple app, we'll assume predecessors usually refer to earlier tasks
  
  const processTask = (task: Task) => {
    if (task.id === 'start-milestone') {
      task.startDate = startOfDay(projectStartDate);
      task.endDate = startOfDay(projectStartDate);
      return;
    }

    let startDate = startOfDay(projectStartDate);

    if (task.predecessorId) {
      const predecessor = updatedTasks.find(t => t.id === task.predecessorId);
      if (predecessor) {
        // Finish-to-Start: starts the day after predecessor ends, minus overlap
        startDate = addDays(predecessor.endDate, 1 - (task.overlap || 0));
      }
    }

    task.startDate = startDate;
    // Duration is in days. If duration is 1, start and end are same day? 
    // Actually, in MS Project, if duration is 1 day, it starts and ends on same day.
    // So endDate = startDate + (duration - 1)
    task.endDate = addDays(startDate, Math.max(0, task.duration - 1));
  };

  // Simple iterative approach to handle dependencies
  // In a real app we'd use a topological sort or multiple passes
  for (let i = 0; i < 5; i++) { // 5 passes should handle most simple chains
    updatedTasks.forEach(processTask);
  }

  return updatedTasks;
};

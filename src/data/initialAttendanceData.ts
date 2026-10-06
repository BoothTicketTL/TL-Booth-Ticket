import { StadiumAttendanceRecord } from '../types';

/**
 * No built-in attendance data. Attendance (scores + Audience) exists only after an Excel file is imported
 * (columns: Date, Time, Home, Home Score, Away Score, Away, Stadium, Audience). No mock / sample records.
 */
export const INITIAL_ATTENDANCE_RECORDS: StadiumAttendanceRecord[] = [];

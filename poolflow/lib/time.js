'use strict';

// Time helpers.
//
// v1 stores every timestamp as a 'YYYY-MM-DD HH:MM' string in the business's local time.
// There is deliberately no timezone library: the pilot operator works in a single
// timezone, and this format sorts chronologically as plain text, which is all the week
// view and the slot maths need. When we add a second timezone (or DST-sensitive
// reminders) replace this file wholesale rather than patching around it.

const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const DATETIME_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$/;
const TIME_RE = /^[0-9]{2}:[0-9]{2}$/;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

const isDate = (s) => typeof s === 'string' && DATE_RE.test(s);
const isDateTime = (s) => typeof s === 'string' && DATETIME_RE.test(s);
const isTime = (s) => typeof s === 'string' && TIME_RE.test(s);

// 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD' -> Date in server local time.
function parseLocal(s) {
  if (!s) return null;
  const [datePart, timePart] = String(s).split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = (timePart || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function formatDate(dt) {
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
}

function formatDateTime(dt) {
  return formatDate(dt) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
}

function today() {
  return formatDate(new Date());
}

function nowDateTime() {
  return formatDateTime(new Date());
}

function addDays(dateOrDateTime, days) {
  const dt = parseLocal(dateOrDateTime);
  dt.setDate(dt.getDate() + days);
  return isDateTime(dateOrDateTime) ? formatDateTime(dt) : formatDate(dt);
}

function addMinutes(dateTime, minutes) {
  const dt = parseLocal(dateTime);
  dt.setMinutes(dt.getMinutes() + minutes);
  return formatDateTime(dt);
}

// ISO weekday, 1 = Monday .. 7 = Sunday. Matches businesses.workdays.
function isoWeekday(dateOrDateTime) {
  const day = parseLocal(dateOrDateTime).getDay();
  return day === 0 ? 7 : day;
}

// Monday of the week containing the given date.
function startOfWeek(dateOrDateTime) {
  const date = String(dateOrDateTime).split(' ')[0];
  return addDays(date, -(isoWeekday(date) - 1));
}

// Seven 'YYYY-MM-DD' strings starting at the given Monday.
function weekDates(monday) {
  const out = [];
  for (let i = 0; i < 7; i += 1) out.push(addDays(monday, i));
  return out;
}

function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function minutesToHhmm(total) {
  const m = ((total % 1440) + 1440) % 1440;
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}

function minutesBetween(a, b) {
  return Math.round((parseLocal(b) - parseLocal(a)) / 60000);
}

// '2026-08-04 10:00' -> '10:00 AM'
function clockLabel(dateTime) {
  const dt = parseLocal(dateTime);
  const h24 = dt.getHours();
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return h12 + ':' + pad(dt.getMinutes()) + ' ' + suffix;
}

// '2026-08-04 10:00' -> 'Tuesday Aug 4 at 10:00 AM'. Used in SMS copy, so keep it short
// and unambiguous: the customer has to be able to confirm without asking what day it is.
function humanDateTime(dateTime) {
  const dt = parseLocal(dateTime);
  return DAY_NAMES[dt.getDay()] + ' ' + MONTH_NAMES[dt.getMonth()] + ' ' + dt.getDate() +
    ' at ' + clockLabel(dateTime);
}

function humanDate(date) {
  const dt = parseLocal(date);
  return DAY_NAMES[dt.getDay()] + ' ' + MONTH_NAMES[dt.getMonth()] + ' ' + dt.getDate();
}

module.exports = {
  DAY_NAMES,
  MONTH_NAMES,
  pad,
  isDate,
  isDateTime,
  isTime,
  parseLocal,
  formatDate,
  formatDateTime,
  today,
  nowDateTime,
  addDays,
  addMinutes,
  isoWeekday,
  startOfWeek,
  weekDates,
  hhmmToMinutes,
  minutesToHhmm,
  minutesBetween,
  clockLabel,
  humanDateTime,
  humanDate,
};


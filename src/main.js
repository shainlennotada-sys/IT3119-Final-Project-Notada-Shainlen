
import './style.css';
import { supabase } from './supabaseClient.js';

const $ = (id) => document.getElementById(id);

let rows = [];
let courses = [];
let departments = [];
let sessionVersion = 0;
let accessReady = false;

const say = (text) => {
  $('message').textContent = text;
};

function clearForm() {
  $('student-form').reset();
  $('student-id').value = '';
}

function render() {
  const term = $('search').value.trim().toLowerCase();
  $('list').replaceChildren();

  const visible = rows.filter((s) =>
    `${s.student_no} ${s.first_name} ${s.last_name}`
      .toLowerCase()
      .includes(term)
  );

  if (!visible.length) {
    const li = document.createElement('li');
    li.textContent = 'No matching records.';
    $('list').append(li);
  }

  for (const s of visible) {
    const c = courses.find(
      (x) => String(x.course_id) === String(s.course_id)
    );

    const d = departments.find(
      (x) => String(x.department_id) === String(c?.department_id)
    );

    const li = document.createElement('li');
    const text = document.createElement('span');

    text.textContent =
      `${s.student_no} | ${s.first_name} ${s.last_name}` +
      ` | Year ${s.year_level} | ${s.email}` +
      ` | ${c?.course_code ?? s.course}` +
      ` | ${d?.department_name ?? c?.department ?? 'No department'}` +
      ` | Created: ${s.created_at ?? 'N/A'}`;

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';

    edit.onclick = () => {
      $('student-id').value = s.id;
      $('student-no').value = s.student_no;
      $('first-name').value = s.first_name;
      $('last-name').value = s.last_name;
      $('year').value = s.year_level;
      $('student-email').value = s.email;
      $('course').value = s.course_id ?? '';

      say('Editing record. Change a value, then Save student.');
      $('student-no').focus();
    };

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';

    remove.onclick = async () => {
      if (!confirm(`Delete student ${s.student_no}?`)) return;

      const result = await supabase
        .from('students')
        .delete()
        .eq('id', s.id)
        .select('id');

      if (result.error) return say(result.error.message);
      if (!result.data?.length) {
        return say('Nothing deleted. Check access.');
      }

      await load();
      say('Student deleted.');
    };

    li.append(text, edit, remove);
    $('list').append(li);
  }
}

async function load(version = sessionVersion) {
  const results = await Promise.all([
    supabase.from('students').select('*').order('last_name'),
    supabase.from('courses').select('*').order('course_code'),
    supabase.from('departments').select('*').order('department_name')
  ]);

  if (version !== sessionVersion) return;

  const error = results.find((r) => r.error)?.error;

  if (error) {
    say(error.message);
    return;
  }

  rows = results[0].data ?? [];
  courses = results[1].data ?? [];
  departments = results[2].data ?? [];

  const selected = $('course').value;

  $('course').replaceChildren(
    new Option('Choose a course', '')
  );

  for (const c of courses) {
    $('course').add(
      new Option(
        `${c.course_code ?? ''} - ${c.course_name ?? 'Unnamed course'}`,
        c.course_id
      )
    );
  }

  $('course').value = selected;
  render();

  say(`${rows.length} student record(s) loaded.`);
}

async function syncSession() {
  const version = ++sessionVersion;

  const { data, error } = await supabase.auth.getSession();

  if (version !== sessionVersion) return;

  accessReady = !!data.session && !error;

  $('app').hidden = !accessReady;
  $('login').hidden = accessReady;

  $('auth-message').textContent =
    error?.message ??
    (accessReady
      ? `Signed in as ${data.session.user.email}`
      : 'Sign in to continue.');

  rows = [];
  courses = [];
  departments = [];

  $('list').replaceChildren();
  $('course').replaceChildren();
  $('report').textContent = '';

  clearForm();

  if (accessReady) await load(version);
}

$('login').onsubmit = async (event) => {
  event.preventDefault();

  const { error } = await supabase.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value
  });

  if (error) {
    $('auth-message').textContent = error.message;
  } else {
    $('password').value = '';
    await syncSession();
  }
};

$('register').onclick = async () => {
  if (!$('login').reportValidity()) return;

  const password = $('password').value;

  if (password.length < 8) {
    $('auth-message').textContent = 'Use at least 8 characters.';
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email: $('email').value.trim(),
    password,
    options: {
      emailRedirectTo: window.location.origin
    }
  });

  $('auth-message').textContent = error
    ? error.message
    : data.session
      ? 'Account created. Sign in is active.'
      : 'Check your email for confirmation, then sign in. Ask the instructor for record access.';

  if (!error) $('password').value = '';
};

$('logout').onclick = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    $('auth-message').textContent = error.message;
  } else {
    await syncSession();
  }
};

$('student-form').onsubmit = async (event) => {
  event.preventDefault();

  if (!accessReady) return say('Sign in first.');

  const courseId = $('course').value;
  const selectedCourse = courses.find(
    (c) => String(c.course_id) === String(courseId)
  );

  if (!selectedCourse) {
    return say('Please choose a valid course.');
  }

  const record = {
    student_no: $('student-no').value.trim(),
    first_name: $('first-name').value.trim(),
    last_name: $('last-name').value.trim(),
    course: selectedCourse.course_name,
    year_level: Number($('year').value),
    email: $('student-email').value.trim(),
    course_id: Number(courseId)
  };

  if (
    !record.student_no ||
    !record.first_name ||
    !record.last_name ||
    !record.email ||
    !Number.isInteger(record.year_level) ||
    record.year_level < 1 ||
    record.year_level > 4
  ) {
    return say('Complete all fields. Year must be 1 to 4.');
  }

  const id = $('student-id').value;

  const query = id
    ? supabase.from('students').update(record).eq('id', id)
    : supabase.from('students').insert(record);

  const { data, error } = await query.select('id');

  if (error) return say(error.message);
  if (!data?.length) return say('Nothing saved. Check permissions.');

  clearForm();
  await load();
  say('Student saved.');
};

$('clear').onclick = clearForm;
$('refresh').onclick = () => load();
$('search').oninput = render;

$('count').onclick = async () => {
  const courseId = $('course').value;

  if (!courseId) return say('Choose a course first.');

  const { count, error } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', Number(courseId));

  $('report').textContent = error
    ? error.message
    : `Total students: ${count ?? 0}`;
};

supabase.auth.onAuthStateChange(() => {
  setTimeout(() => {
    syncSession().catch((e) => say(e.message));
  }, 0);
});

syncSession().catch((e) => say(e.message));

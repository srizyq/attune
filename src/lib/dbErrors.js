// A column the app tried to write isn't in the database yet — the app was
// deployed before its SQL update was run. PostgREST reports it as PGRST204
// ("Could not find the 'x' column of 'y' in the schema cache"); Postgres itself
// as 42703 (undefined_column). Callers retry without the new columns instead of
// failing the whole write.
export function isMissingColumnError(error) {
  if (!error) return false;
  return error.code === 'PGRST204'
    || error.code === '42703'
    || /could not find the '[^']+' column/i.test(error.message || '')
    || /column "[^"]+" of relation "[^"]+" does not exist/i.test(error.message || '');
}

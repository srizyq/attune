import { createContext } from 'react';

// Set by ProfileProvider; useProfile falls back to its own copy when there is none.
export const ProfileContext = createContext(null);

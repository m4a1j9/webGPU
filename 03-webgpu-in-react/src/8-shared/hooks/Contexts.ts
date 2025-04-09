// pohui
import { Core } from '@features/Life';
import { createContext } from 'react';

export const LifeContext = createContext<{ core: Core | null }>({ core: null });

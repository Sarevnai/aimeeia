import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export type DepartmentFilter = 'all' | 'locacao' | 'vendas' | 'administrativo' | 'remarketing';

interface DepartmentFilterContextType {
  department: DepartmentFilter;
  setDepartment: (d: DepartmentFilter) => void;
  label: string;
  isLocked: boolean; // true when operator has a fixed department_code
}

const labels: Record<DepartmentFilter, string> = {
  all: 'Todos',
  locacao: 'Locação',
  vendas: 'Vendas',
  administrativo: 'Administrativo',
  remarketing: 'Remarketing',
};

const DepartmentFilterContext = createContext<DepartmentFilterContextType>({
  department: 'all',
  setDepartment: () => {},
  label: 'Todos',
  isLocked: false,
});

export const useDepartmentFilter = () => useContext(DepartmentFilterContext);

export const DepartmentFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const isOperatorWithDept = profile?.role === 'operator' && !!profile?.department_code;
  const lockedDept = isOperatorWithDept ? (profile!.department_code as DepartmentFilter) : null;

  const [department, setDepartmentState] = useState<DepartmentFilter>('all');

  // Lock department when operator has a department_code
  useEffect(() => {
    if (lockedDept) {
      setDepartmentState(lockedDept);
    }
  }, [lockedDept]);

  const setDepartment = (d: DepartmentFilter) => {
    // Operators with fixed department cannot change the filter
    if (isOperatorWithDept) return;
    setDepartmentState(d);
  };

  return (
    <DepartmentFilterContext.Provider value={{
      department: lockedDept || department,
      setDepartment,
      label: labels[lockedDept || department],
      isLocked: isOperatorWithDept,
    }}>
      {children}
    </DepartmentFilterContext.Provider>
  );
};

import React, { createContext, useContext, useState } from 'react';

export type DepartmentFilter = 'all' | 'locacao' | 'vendas' | 'administrativo';

interface DepartmentFilterContextType {
  department: DepartmentFilter;
  setDepartment: (d: DepartmentFilter) => void;
  label: string;
}

const labels: Record<DepartmentFilter, string> = {
  all: 'Todos',
  locacao: 'Locação',
  vendas: 'Vendas',
  administrativo: 'Administrativo',
};

const DepartmentFilterContext = createContext<DepartmentFilterContextType>({
  department: 'all',
  setDepartment: () => {},
  label: 'Todos',
});

export const useDepartmentFilter = () => useContext(DepartmentFilterContext);

export const DepartmentFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [department, setDepartment] = useState<DepartmentFilter>('all');
  return (
    <DepartmentFilterContext.Provider value={{ department, setDepartment, label: labels[department] }}>
      {children}
    </DepartmentFilterContext.Provider>
  );
};

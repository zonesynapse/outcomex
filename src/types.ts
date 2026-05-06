export interface PartConfig {
  name: string;
  marksPerQuestion: number;
  numberOfQuestions: number;
  hasInternalChoice: boolean;
}

export interface CIAConfig {
  id?: string;
  program: string;
  department: string;
  batch: string;
  academicYear: string;
  semester: string;
  examName: string;
  totalMarks: number;
  createdAt: string;
}

export interface QuestionPaper {
  id?: string;
  configId: string;
  program: string;
  department: string;
  batch: string;
  academicYear: string;
  semester: string;
  examName: string;
  parts: {
    name: string;
    marks: number;
  }[];
  totalMarks: number;
  createdAt: string;
}

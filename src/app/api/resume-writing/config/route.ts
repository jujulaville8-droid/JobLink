import { writingConfig,writingJson } from '@/lib/resume-writing-server';
export function GET(){return writingJson({config:writingConfig()});}

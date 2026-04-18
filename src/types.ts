export interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  themeKeyword: string;
  soundType: 'success' | 'failure' | 'neutral';
}

export interface QuizState {
  currentQuestionIndex: number;
  score: number;
  history: Question[];
  status: 'start' | 'playing' | 'review' | 'leaderboard';
  playerName: string;
  rank?: string;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  timestamp: string;
}

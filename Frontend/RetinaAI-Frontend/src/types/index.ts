export type DRGrade = 0 | 1 | 2 | 3 | 4;
export type ReviewStatus = 'not_required' | 'pending' | 'reviewed';
export type QualityStatus = 'good' | 'borderline' | 'ungradable';
export type UserRole = 'health_worker' | 'doctor';
export type ScreeningStatus = 'uploading' | 'quality_check' | 'analyzing' | 'complete' | 'needs_recapture';
export type ProgressionStatus = 'baseline' | 'stable' | 'possible_improvement' | 'possible_worsening' | 'indeterminate';
export type RegistrationStatus = 'success' | 'failed' | 'skipped' | 'no_prev_image';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  centre: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface QualityScores {
  focus: number;       // 0-100
  brightness: number;
  contrast: number;
  fov: number;
  overall: number;
}

export interface QualityResult {
  status: QualityStatus;
  reason: string | null;
  recapture_message: string | null;
  scores: QualityScores;
}

export interface BiomarkersResult {
  avr?: number | null;
  crae_pixels?: number | null;
  crve_pixels?: number | null;
  mean_tortuosity_distance?: number | null;
  mean_tortuosity_curvature?: number | null;
  max_tortuosity?: number | null;
  fractal_dimension?: number | null;
  fractal_r_squared?: number | null;
  vessel_density?: number | null;
  zone_b_count?: number | null;
  branch_count?: number | null;
  runtime_seconds?: number | null;
  status?: 'completed' | 'skipped' | 'failed' | string | null;
  error_message?: string | null;
}

export interface EyeResult {
  quality: QualityResult;
  dr_grade: DRGrade;
  dr_grade_name: string;
  class_probabilities: number[];  // [p0,p1,p2,p3,p4]
  confidence_raw: number;
  confidence_calibrated: number;
  referable: boolean;
  original_image_url?: string | null;
  vessel_density?: number | null;
  gradcam_url: string | null;
  vessel_overlay_url: string | null;
  vessel_mask_url: string | null;
  od_fovea_overlay_url: string | null;
  od_x: number | null;
  od_y: number | null;
  od_confidence: number | null;
  fovea_x: number | null;
  fovea_y: number | null;
  fovea_confidence: number | null;
  lesion: LesionResult | null;  // null = not available yet
  biomarkers?: BiomarkersResult | null;
  avr?: number | null;
  vessel_tortuosity?: number | null;
  fractal_dimension?: number | null;
}

export interface LesionCategory {
  name: string;
  detected: boolean;
  confidence: number;
  count?: number;
}

export interface LesionResult {
  microaneurysm: LesionCategory;
  exudate: LesionCategory;
  hemorrhage: LesionCategory;
  neovascularization: LesionCategory;
  overlay_url: string | null;
}

export interface ScreeningResult {
  screening_id: string;
  patient_id: string;
  patient_name: string;
  status: ScreeningStatus;
  created_at: string;
  analyzed_at: string | null;
  pipeline_time_seconds: number | null;
  left_eye: EyeResult | null;
  right_eye: EyeResult | null;
  overall_referable: boolean | null;
  recommendation: string | null;
  review_status: ReviewStatus;
  review: ReviewDecision | null;
}

export interface ReviewDecision {
  id: string;
  reviewer_id?: string | null;
  reviewer_name: string;
  decision: 'confirmed' | 'modified' | 'flagged';
  final_grade_left: DRGrade | null;
  final_grade_right: DRGrade | null;
  final_referable: boolean | null;
  notes: string | null;
  reviewed_at: string | null;
  review_duration_seconds?: number | null;
}

export interface Patient {
  id: string;
  patient_display_id: string;
  name: string;
  age: number;
  sex: string;
  diabetes_duration: number;
  previous_dr: string;
  previous_screening: string | null;
  hba1c: string | null;
  created_at: string;
  screenings?: ScreeningResult[];
  progression_status?: ProgressionStatus | null;
}

export interface AnalyticsSummary {
  total_screenings: number;
  today_screenings: number;
  referable_cases: number;
  non_referable_cases: number;
  ungradable_images: number;
  pending_reviews: number;
  average_pipeline_time: number;
  average_review_time?: number;
  grade_distribution: Record<string, number>;
  recapture_rate: number;
  monthly_volumes: Array<{ month: string; count: number }>;
}

export interface InProgressScreening {
  patientId: string | null;
  patientName: string | null;
  patientDisplayId?: string | null;
  isFollowUp?: boolean;
  previousExamDate?: string | null;
  previousExamGrade?: string | null;
  screeningId: string | null;
  leftImageFile: File | null;
  rightImageFile: File | null;
  leftPreviewUrl: string | null;
  rightPreviewUrl: string | null;
  currentEye: 'left' | 'right';
  result: ScreeningResult | null;
}

/** Longitudinal Comparison — result of comparing two retinal screenings for the same patient. */
export interface LongitudinalComparison {
  id: string;
  patient_id: string;
  previous_screening_id: string | null;
  current_screening_id: string;

  // Image registration
  left_registration_status: RegistrationStatus | null;
  left_registration_quality: number | null;   // inlier ratio 0-1
  left_diff_overlay_url: string | null;

  right_registration_status: RegistrationStatus | null;
  right_registration_quality: number | null;
  right_diff_overlay_url: string | null;

  // DR grades
  left_grade_prev: number | null;
  left_grade_curr: number | null;
  left_prob_prev: number[] | null;  // percentages 0-100
  left_prob_curr: number[] | null;

  right_grade_prev: number | null;
  right_grade_curr: number | null;
  right_prob_prev: number[] | null;
  right_prob_curr: number[] | null;

  // Structural
  left_od_distance: number | null;
  left_fovea_distance: number | null;
  left_vessel_density_prev: number | null;
  left_vessel_density_curr: number | null;

  right_od_distance: number | null;
  right_fovea_distance: number | null;
  right_vessel_density_prev: number | null;
  right_vessel_density_curr: number | null;

  // Lesion (modular — null until models support delta)
  lesion_comparison: any | null;

  // Assessment
  progression_status: ProgressionStatus;
  supporting_evidence: string[];
  recommendation: string | null;
  ai_explanation: string | null;

  created_at: string | null;

  // Previous exam metadata (for display)
  previous_screening_date: string | null;
  previous_screening_display_id: string | null;
  current_screening_date: string | null;
  current_screening_display_id: string | null;
}

/** Timeline item returned by GET /api/patients/:id/timeline */
export interface TimelineItem {
  exam_number?: number;
  exam_title?: string;
  exam_type?: string;
  screening_id: string;
  screening_display_id: string;
  previous_screening_id?: string | null;
  created_at: string | null;
  status: string;
  left_dr_grade: number | null;
  right_dr_grade: number | null;
  max_grade: number | null;
  dr_grade_name?: string;
  confidence?: number;
  change_text?: string | null;
  overall_referable: boolean | null;
  review_status: string;
  comparison_id: string | null;
  progression_status: ProgressionStatus | null;
}

export interface PatientTimeline {
  patient_id: string;
  patient_display_id: string;
  patient_name: string;
  timeline: TimelineItem[];
}


import React, { createContext, useContext, useState } from 'react';
import { InProgressScreening, ScreeningResult } from '../types';

export interface EyeQualityData {
  status: 'good' | 'borderline' | 'ungradable';
  reason: string | null;
  recapture_message: string | null;
  scores: { focus: number; brightness: number; contrast: number; fov: number; overall: number };
  enhanced: boolean;
}

export interface QualityAssessmentResult {
  screening_id: string;
  status: string;
  left?: EyeQualityData;
  right?: EyeQualityData;
  any_ungradable: boolean;
  all_ungradable: boolean;
}

const defaultState: InProgressScreening = {
  patientId: null, patientName: null, screeningId: null,
  leftImageFile: null, rightImageFile: null,
  leftPreviewUrl: null, rightPreviewUrl: null,
  currentEye: 'left', result: null
};

interface ScreeningContextValue {
  screening: InProgressScreening;
  qualityData: QualityAssessmentResult | null;
  setPatient: (id: string, name: string, extra?: { patientDisplayId?: string; isFollowUp?: boolean; previousExamDate?: string; previousExamGrade?: string }) => void;
  setScreeningId: (id: string) => void;
  setImage: (eye: 'left' | 'right', file: File, previewUrl: string) => void;
  removeImage: (eye: 'left' | 'right') => void;
  setResult: (result: ScreeningResult) => void;
  setQuality: (q: QualityAssessmentResult) => void;
  reset: () => void;
}

const ScreeningContext = createContext<ScreeningContextValue | null>(null);

export function ScreeningProvider({ children }: { children: React.ReactNode }) {
  const [screening, setScreening] = useState<InProgressScreening>(defaultState);
  const [qualityData, setQualityData] = useState<QualityAssessmentResult | null>(null);

  const setPatient = (id: string, name: string, extra?: { patientDisplayId?: string; isFollowUp?: boolean; previousExamDate?: string; previousExamGrade?: string }) =>
    setScreening(s => ({ 
      ...s, 
      patientId: id, 
      patientName: name,
      patientDisplayId: extra?.patientDisplayId || s.patientDisplayId,
      isFollowUp: extra?.isFollowUp !== undefined ? extra.isFollowUp : s.isFollowUp,
      previousExamDate: extra?.previousExamDate || s.previousExamDate,
      previousExamGrade: extra?.previousExamGrade || s.previousExamGrade,
    }));
  
  const setScreeningId = (id: string) =>
    setScreening(s => ({ ...s, screeningId: id }));
  
  const setImage = (eye: 'left' | 'right', file: File, previewUrl: string) =>
    setScreening(s => ({
      ...s,
      leftImageFile: eye === 'left' ? file : s.leftImageFile,
      rightImageFile: eye === 'right' ? file : s.rightImageFile,
      leftPreviewUrl: eye === 'left' ? previewUrl : s.leftPreviewUrl,
      rightPreviewUrl: eye === 'right' ? previewUrl : s.rightPreviewUrl,
    }));

  const removeImage = (eye: 'left' | 'right') => {
    setScreening(s => ({
      ...s,
      leftImageFile: eye === 'left' ? null : s.leftImageFile,
      rightImageFile: eye === 'right' ? null : s.rightImageFile,
      leftPreviewUrl: eye === 'left' ? null : s.leftPreviewUrl,
      rightPreviewUrl: eye === 'right' ? null : s.rightPreviewUrl,
    }));
    setQualityData(prev => {
      if (!prev) return null;
      const updatedLeft = eye === 'left' ? undefined : prev.left;
      const updatedRight = eye === 'right' ? undefined : prev.right;
      const anyUngrad = (updatedLeft?.status === 'ungradable') || (updatedRight?.status === 'ungradable');
      const allUngrad = Boolean(
        (!updatedLeft || updatedLeft.status === 'ungradable') &&
        (!updatedRight || updatedRight.status === 'ungradable') &&
        Boolean(updatedLeft || updatedRight)
      );
      return {
        ...prev,
        left: updatedLeft,
        right: updatedRight,
        any_ungradable: anyUngrad,
        all_ungradable: allUngrad,
      };
    });
  };
  
  const setResult = (result: ScreeningResult) =>
    setScreening(s => ({ ...s, result }));

  const setQuality = (q: QualityAssessmentResult) => {
    setQualityData(prev => {
      if (!prev) return q;
      const mergedLeft = q.left !== undefined ? q.left : prev.left;
      const mergedRight = q.right !== undefined ? q.right : prev.right;
      const anyUngrad = (mergedLeft?.status === 'ungradable') || (mergedRight?.status === 'ungradable');
      const allUngrad = Boolean(
        (!mergedLeft || mergedLeft.status === 'ungradable') &&
        (!mergedRight || mergedRight.status === 'ungradable') &&
        Boolean(mergedLeft || mergedRight)
      );
      return {
        ...prev,
        ...q,
        left: mergedLeft,
        right: mergedRight,
        any_ungradable: anyUngrad,
        all_ungradable: allUngrad,
      };
    });
  };
  
  const reset = () => {
    setScreening(defaultState);
    setQualityData(null);
  };

  return (
    <ScreeningContext.Provider value={{ screening, qualityData, setPatient, setScreeningId, setImage, removeImage, setResult, setQuality, reset }}>
      {children}
    </ScreeningContext.Provider>
  );
}

export function useScreening() {
  const ctx = useContext(ScreeningContext);
  if (!ctx) throw new Error('useScreening must be used within ScreeningProvider');
  return ctx;
}

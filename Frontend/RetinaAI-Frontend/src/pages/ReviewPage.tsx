import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionHeader, Stepper, Card, Button } from '../components';
import { useScreening } from '../contexts/ScreeningContext';
import { submitReview } from '../services/review';

export default function ReviewPage() {
  const { screening } = useScreening();
  const nav = useNavigate();
  const [notes, setNotes] = useState('');
  
  const [isModifying, setIsModifying] = useState(false);
  const [gradeLeft, setGradeLeft] = useState<number | ''>(screening?.result?.left_eye?.dr_grade ?? '');
  const [gradeRight, setGradeRight] = useState<number | ''>(screening?.result?.right_eye?.dr_grade ?? '');
  const [startTime] = useState(Date.now());
  
  const handleReview = async (decision: string) => {
    if (!screening.screeningId) return;
    try {
      const durationSeconds = (Date.now() - startTime) / 1000;
      const payload: any = { decision, notes, review_duration_seconds: durationSeconds };
      
      if (decision === 'modified') {
        if (!isModifying) {
          setIsModifying(true);
          return;
        }
        payload.final_grade_left = gradeLeft === '' ? null : gradeLeft;
        payload.final_grade_right = gradeRight === '' ? null : gradeRight;
        
        const lRef = payload.final_grade_left !== null && payload.final_grade_left >= 2;
        const rRef = payload.final_grade_right !== null && payload.final_grade_right >= 2;
        payload.final_referable = lRef || rRef;
      } else if (decision === 'confirmed') {
        payload.final_grade_left = screening?.result?.left_eye?.dr_grade ?? null;
        payload.final_grade_right = screening?.result?.right_eye?.dr_grade ?? null;
        payload.final_referable = screening?.result?.overall_referable ?? false;
      }

      await submitReview(screening.screeningId, payload);
      nav('/screening/report');
    } catch (err) {
      alert('Review failed');
    }
  };

  const renderGradeSelect = (eye: 'left' | 'right', value: number | '', onChange: (val: number | '') => void) => {
    return (
      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
          {eye === 'left' ? 'Left Eye Final Grade' : 'Right Eye Final Grade'}
        </label>
        <select 
          value={value} 
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ padding: 8, width: '100%', maxWidth: 300, borderRadius: 4, border: '1px solid #ccc' }}
        >
          <option value="">None / Not Analysed</option>
          <option value={0}>Grade 0 (No DR)</option>
          <option value={1}>Grade 1 (Mild NPDR)</option>
          <option value={2}>Grade 2 (Moderate NPDR)</option>
          <option value={3}>Grade 3 (Severe NPDR)</option>
          <option value={4}>Grade 4 (Proliferative DR)</option>
        </select>
      </div>
    );
  };

  return (
    <>
      <SectionHeader title="Human Review" />
      <Stepper active={5} />
      <Card style={{ marginTop: 24 }}>
        <h3>Clinical Decision</h3>
        
        {isModifying && (
          <div style={{ padding: 16, backgroundColor: '#f8f9fa', borderRadius: 8, marginTop: 16, border: '1px solid #e9ecef' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Adjust Final Grades</h4>
            {renderGradeSelect('left', gradeLeft, setGradeLeft)}
            {renderGradeSelect('right', gradeRight, setGradeRight)}
          </div>
        )}

        <textarea 
          value={notes} 
          onChange={e => setNotes(e.target.value)} 
          placeholder="Clinical notes..." 
          style={{ width: '100%', minHeight: 100, marginTop: 16, padding: 12, boxSizing: 'border-box' }} 
        />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <Button variant="secondary" onClick={() => nav('/screening/result')}>← Back to Results</Button>
          <div style={{ display: 'flex', gap: 12 }}>
            {!isModifying ? (
              <>
                <Button onClick={() => handleReview('confirmed')}>Confirm AI Grade</Button>
                <Button variant="secondary" onClick={() => handleReview('modified')}>Modify Grade</Button>
                <Button variant="danger" onClick={() => handleReview('flagged')}>Flag for Specialist</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setIsModifying(false)}>Cancel Modification</Button>
                <Button onClick={() => handleReview('modified')}>Submit Modified Grade</Button>
              </>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}

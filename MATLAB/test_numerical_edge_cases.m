% TEST_NUMERICAL_EDGE_CASES - Automated Numerical & Degenerate Input Validation
%
% Part of RetinaAI Phase 6 Subsystem Finalization.
% Verifies that retina_biomarkers.m safely handles extreme, degenerate, and boundary
% inputs without crashes, unhandled exceptions, non-finite leakages, or fabricated values.
%
% Usage:
%   matlab -batch "test_numerical_edge_cases; quit;"

clc;
clear;
close all;

fprintf('========================================================================\n');
fprintf(' RetinaAI: Retinal Biomarkers Automated Numerical Edge-Case Test Suite\n');
fprintf('========================================================================\n\n');

total_tests = 0;
passed_tests = 0;

H = 512;
W = 512;
blank_fundus = uint8(zeros(H, W, 3));
default_od = [256.0, 256.0];
default_fov = [NaN, NaN];

% -------------------------------------------------------------------------
% Test 1: Empty (Zero-Vessel) Mask
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 1] Empty (Zero-Vessel) Mask...\n');
mask1 = false(H, W);
[bm1, diag1] = retina_biomarkers(mask1, blank_fundus, default_od, default_fov);

assert(bm1.vessel_density == 0.0, 'Test 1 Failed: Expected vessel_density == 0.0');
assert(bm1.branch_count == 0, 'Test 1 Failed: Expected branch_count == 0');
assert(bm1.zone_b_count == 0, 'Test 1 Failed: Expected zone_b_count == 0');
assert(isnan(bm1.fractal_dimension), 'Test 1 Failed: Expected fractal_dimension == NaN');
assert(isnan(bm1.fractal_r_squared), 'Test 1 Failed: Expected fractal_r_squared == NaN');
assert(isnan(bm1.avr), 'Test 1 Failed: Expected avr == NaN');
assert(isnan(bm1.crae_pixels), 'Test 1 Failed: Expected crae_pixels == NaN');
assert(isnan(bm1.crve_pixels), 'Test 1 Failed: Expected crve_pixels == NaN');
assert(bm1.mean_tortuosity_distance == 0.0, 'Test 1 Failed: Expected mean_tortuosity_distance == 0.0');
assert(bm1.mean_tortuosity_curvature == 0.0, 'Test 1 Failed: Expected mean_tortuosity_curvature == 0.0');
assert(bm1.max_tortuosity == 0.0, 'Test 1 Failed: Expected max_tortuosity == 0.0');
fprintf('         PASSED: Empty mask returned exact safe default/NaN values.\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Test 2: Single Isolated Pixel Mask
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 2] Single Isolated Pixel Mask...\n');
mask2 = false(H, W);
mask2(256, 256) = true;
[bm2, diag2] = retina_biomarkers(mask2, blank_fundus, default_od, default_fov);

assert(abs(bm2.vessel_density - 1.0 / (H * W)) < 1e-8, 'Test 2 Failed: Incorrect single-pixel density');
assert(bm2.branch_count == 0, 'Test 2 Failed: Single pixel should not produce branches');
assert(isnan(bm2.fractal_dimension), 'Test 2 Failed: Single pixel should have NaN fractal dimension (< 3 scales)');
assert(isnan(bm2.avr), 'Test 2 Failed: Single pixel should have NaN AVR');
assert(bm2.mean_tortuosity_distance == 0.0, 'Test 2 Failed: Expected 0.0 distance tortuosity');
assert(bm2.mean_tortuosity_curvature == 0.0, 'Test 2 Failed: Expected 0.0 curvature tortuosity');
fprintf('         PASSED: Single-pixel input safely ignored without fabricated branches.\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Test 3: Straight Horizontal Vessel Segment
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 3] Straight Horizontal Vessel Segment...\n');
mask3 = false(H, W);
mask3(255:257, 100:400) = true; % 301 px horizontal line
[bm3, diag3] = retina_biomarkers(mask3, blank_fundus, default_od, default_fov);

assert(bm3.branch_count >= 1, 'Test 3 Failed: Straight vessel should produce at least 1 branch');
assert(bm3.mean_tortuosity_distance < 0.05, sprintf('Test 3 Failed: Straight line tau_d (%.4f) should be ~0', bm3.mean_tortuosity_distance));
assert(bm3.mean_tortuosity_curvature < 0.01, sprintf('Test 3 Failed: Straight line tau_c (%.4f) should be ~0', bm3.mean_tortuosity_curvature));
assert(bm3.max_tortuosity < 0.05, 'Test 3 Failed: Max tortuosity for straight line should be ~0');
fprintf('         PASSED: Straight horizontal vessel verified (tau_d ≈ 0, tau_c ≈ 0).\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Test 4: Straight Vertical Vessel Segment
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 4] Straight Vertical Vessel Segment...\n');
mask4 = false(H, W);
mask4(100:400, 255:257) = true; % 301 px vertical line
[bm4, diag4] = retina_biomarkers(mask4, blank_fundus, default_od, default_fov);

assert(bm4.branch_count >= 1, 'Test 4 Failed: Straight vessel should produce at least 1 branch');
assert(bm4.mean_tortuosity_distance < 0.05, sprintf('Test 4 Failed: Straight vertical tau_d (%.4f) should be ~0', bm4.mean_tortuosity_distance));
assert(bm4.mean_tortuosity_curvature < 0.01, sprintf('Test 4 Failed: Straight vertical tau_c (%.4f) should be ~0', bm4.mean_tortuosity_curvature));
fprintf('         PASSED: Straight vertical vessel verified (tau_d ≈ 0, tau_c ≈ 0).\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Test 5: Semicircular Arc (Curved Vessel)
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 5] Semicircular Arc (Curved Vessel)...\n');
mask5 = false(H, W);
r_arc = 100;
theta = linspace(0, pi, 300);
xs = round(256 + r_arc * cos(theta));
ys = round(256 + r_arc * sin(theta));
valid_pts = (xs >= 1 & xs <= W & ys >= 1 & ys <= H);
for p = 1:length(xs)
    if valid_pts(p)
        mask5(max(1, ys(p)-1):min(H, ys(p)+1), max(1, xs(p)-1):min(W, xs(p)+1)) = true;
    end
end
[bm5, diag5] = retina_biomarkers(mask5, blank_fundus, default_od, default_fov);

% Arc length / Chord length - 1 for semicircle = (pi * R) / (2 * R) - 1 = pi/2 - 1 ≈ 0.5708
assert(bm5.branch_count >= 1, 'Test 5 Failed: Arc should produce at least 1 branch');
assert(bm5.mean_tortuosity_distance > 0.20, sprintf('Test 5 Failed: Semicircle tau_d (%.4f) should be > 0.20', bm5.mean_tortuosity_distance));
assert(bm5.mean_tortuosity_curvature > 0.0, sprintf('Test 5 Failed: Semicircle tau_c (%.4f) should be > 0', bm5.mean_tortuosity_curvature));
assert(isfinite(bm5.mean_tortuosity_curvature), 'Test 5 Failed: Semicircle tau_c must be finite');
fprintf('         PASSED: Curved vessel verified (tau_d > 0.2, tau_c finite & positive).\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Test 6: Missing OD Coordinates (empty array [])
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 6] Missing OD Coordinates ([])...\n');
synthetic_fundus = blank_fundus;
synthetic_fundus(200:230, 200:230, 1) = 220; % simulate bright OD spot in red channel
[bm6, diag6] = retina_biomarkers(mask3, synthetic_fundus, [], default_fov);

assert(diag6.od_center_was_estimated == true, 'Test 6 Failed: Expected od_center_was_estimated == true');
assert(isfinite(diag6.od_center(1)) && isfinite(diag6.od_center(2)), 'Test 6 Failed: Estimated OD center must be finite');
assert(diag6.od_center(1) >= 1 && diag6.od_center(1) <= W, 'Test 6 Failed: OD X out of bounds');
assert(diag6.od_center(2) >= 1 && diag6.od_center(2) <= H, 'Test 6 Failed: OD Y out of bounds');
fprintf('         PASSED: Missing OD safely engaged heuristic center estimator.\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Test 7: Out-of-Bounds OD Coordinates
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 7] Out-of-Bounds OD Coordinates ([-99, 9999])...\n');
[bm7, diag7] = retina_biomarkers(mask3, synthetic_fundus, [-99, 9999], default_fov);

assert(diag7.od_center_was_estimated == true, 'Test 7 Failed: Expected od_center_was_estimated == true for out-of-bounds OD');
assert(diag7.od_center(1) >= 1 && diag7.od_center(1) <= W, 'Test 7 Failed: Estimated OD X out of bounds');
assert(diag7.od_center(2) >= 1 && diag7.od_center(2) <= H, 'Test 7 Failed: Estimated OD Y out of bounds');
fprintf('         PASSED: Out-of-bounds OD safely caught and fallback engaged.\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Test 8: Missing / NaN Fovea Coordinates
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 8] Missing / NaN Fovea Coordinates ([NaN, NaN])...\n');
[bm8, diag8] = retina_biomarkers(mask3, blank_fundus, default_od, [NaN, NaN]);

assert(all(isnan(diag8.fovea_center)), 'Test 8 Failed: Expected fovea_center to be [NaN, NaN]');
fprintf('         PASSED: NaN fovea safely standardized to [NaN, NaN].\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Test 9: Out-of-Bounds Fovea Coordinates
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 9] Out-of-Bounds Fovea Coordinates ([-500, 10000])...\n');
[bm9, diag9] = retina_biomarkers(mask3, blank_fundus, default_od, [-500, 10000]);

assert(all(isnan(diag9.fovea_center)), 'Test 9 Failed: Expected out-of-bounds fovea to be gated to [NaN, NaN]');
fprintf('         PASSED: Out-of-bounds fovea safely gated to [NaN, NaN].\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Test 10: Grayscale (Single-Channel) Fundus Input
% -------------------------------------------------------------------------
total_tests = total_tests + 1;
fprintf('[Test 10] Grayscale (Single-Channel) Fundus Input...\n');
gray_fundus = uint8(ones(H, W) * 128);
[bm10, diag10] = retina_biomarkers(mask3, gray_fundus, default_od, default_fov);

assert(isstruct(bm10), 'Test 10 Failed: Expected valid biomarkers struct from grayscale image');
assert(bm10.branch_count >= 1, 'Test 10 Failed: Expected branch count from valid mask with grayscale fundus');
fprintf('         PASSED: Grayscale fundus safely converted to 3-channel RGB internally.\n');
passed_tests = passed_tests + 1;

% -------------------------------------------------------------------------
% Summary
% -------------------------------------------------------------------------
fprintf('\n========================================================================\n');
fprintf(' NUMERICAL EDGE-CASE RESULTS: %d / %d TESTS PASSED\n', passed_tests, total_tests);
fprintf('========================================================================\n');

if passed_tests == total_tests
    fprintf('[SUCCESS] All numerical edge cases passed assertions with zero errors.\n\n');
else
    error('test_numerical_edge_cases:Failed', 'Some numerical edge cases failed!');
end

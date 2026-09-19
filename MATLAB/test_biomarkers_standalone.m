% TEST_BIOMARKERS_STANDALONE - Standalone Verification & Visual Diagnostics
%
% Part of RetinaAI (SIH 26038) MATLAB/Simulink Integration Suite (Phase 1).
% This script runs without modifying any Python code. It discovers fundus
% images and vessel masks from the repository, invokes retina_biomarkers.m,
% displays numerical diagnostics, and renders multi-panel visual figures.
%
% REQUIREMENTS:
%   - MATLAB R2020a or later
%   - Image Processing Toolbox (for bwmorph, bwconncomp, bwdist, imfindcircles)

clc;
clear;
close all;

fprintf('===================================================================\n');
fprintf(' RetinaAI: Retinal Biomarker Standalone Verification Suite (Phase 1)\n');
fprintf('===================================================================\n\n');

% ─────────────────────────────────────────────────────────────────────────
% 1. Discover Repository Paths and Test Materials
% ─────────────────────────────────────────────────────────────────────────
script_dir = fileparts(mfilename('fullpath'));
repo_root  = fileparts(script_dir);

% Candidate 1: Real pre-segmented screening from Backend static results
mask_path_1 = fullfile(repo_root, 'Backend', 'retinaai-backend', 'static', 'results', ...
    '0455d569-c262-48f1-b038-11c90c587ba2', 'left_vessel_mask.png');
img_path_1  = fullfile(repo_root, 'Backend', 'retinaai-backend', 'static', 'uploads', ...
    '0455d569-c262-48f1-b038-11c90c587ba2_left.jpg');

% Candidate 2: Test sample image from Models directory
img_path_2  = fullfile(repo_root, 'Models', 'test_samples', 'images', 'e4dcca36ceb4.png');

target_img_path  = '';
target_mask_path = '';

if isfile(mask_path_1) && isfile(img_path_1)
    fprintf('[+] Found pipeline pre-segmented pair:\n');
    fprintf('    Fundus Image: %s\n', img_path_1);
    fprintf('    Vessel Mask:  %s\n', mask_path_1);
    target_img_path  = img_path_1;
    target_mask_path = mask_path_1;
elseif isfile(img_path_2)
    fprintf('[!] Pre-segmented mask not found at Candidate 1. Using test sample image:\n');
    fprintf('    Fundus Image: %s\n', img_path_2);
    target_img_path  = img_path_2;
else
    error('test_biomarkers:FileNotFound', 'No valid fundus test image found in repository paths.');
end

% ─────────────────────────────────────────────────────────────────────────
% 2. Ingest Test Data
% ─────────────────────────────────────────────────────────────────────────
fprintf('\n--> Ingesting image data...\n');
fundus_rgb = imread(target_img_path);
[H, W, ~] = size(fundus_rgb);
fprintf('    Image dimensions: %d x %d pixels (Channels: %d)\n', H, W, size(fundus_rgb, 3));

if ~isempty(target_mask_path) && isfile(target_mask_path)
    vessel_mask = imread(target_mask_path);
    if size(vessel_mask, 3) > 1
        vessel_mask = vessel_mask(:, :, 1);
    end
    if size(vessel_mask, 1) ~= H || size(vessel_mask, 2) ~= W
        vessel_mask = imresize(vessel_mask, [H, W], 'nearest');
    end
    vessel_mask = (vessel_mask > 127);
else
    fprintf('    Generating adaptive microvascular mask for standalone demonstration...\n');
    vessel_mask = adaptive_vessel_extract(fundus_rgb);
end

% ─────────────────────────────────────────────────────────────────────────
% Ingest Anatomical Landmarks (Model Predictions vs Fallback)
% ─────────────────────────────────────────────────────────────────────────
% For Candidate 1 (0455d569-c262-48f1-b038-11c90c587ba2_left.jpg, Left Eye):
% PyTorch ODFoveaService predicted:
%   - OD:    (X=2998.25, Y=1830.06), confidence = 0.748 >= 0.30 (Valid nasal landmark)
%     Converting 0-based Python coordinate to 1-based MATLAB: [2999.25, 1831.06]
%   - Fovea: confidence = 0.212 < 0.30 (Sub-threshold boundary noise artifact)
%     In accordance with confidence thresholding, low-confidence predictions are gated to NaN.
if strcmp(target_img_path, img_path_1)
    od_center = [2999.25, 1831.06];
    fovea_center = [NaN, NaN];
    fprintf('    PyTorch Ingested OD center:    (X=%.2f, Y=%.2f) [Confidence: 0.748 >= 0.30]\n', od_center(1), od_center(2));
    fprintf('    PyTorch Fovea prediction:      [Confidence: 0.212 < 0.30 Threshold -> Gated to NaN]\n');
else
    % Fallback heuristic for generic or synthetic test images
    od_center = [round(0.28 * W), round(0.50 * H)];
    fovea_center = [round(0.56 * W), round(0.52 * H)];
    fprintf('    Testing with OD center:        (X=%.1f, Y=%.1f)\n', od_center(1), od_center(2));
    fprintf('    Testing with Fovea center:     (X=%.1f, Y=%.1f)\n', fovea_center(1), fovea_center(2));
end

% ─────────────────────────────────────────────────────────────────────────
% 3. Execute Standalone Biomarker Module
% ─────────────────────────────────────────────────────────────────────────
fprintf('\n--> Executing retina_biomarkers()...\n');
tic;
config = struct();
config.debug = true;
[biomarkers, diagnostics] = retina_biomarkers(vessel_mask, fundus_rgb, od_center, fovea_center, config);
elapsed_sec = toc;

% ─────────────────────────────────────────────────────────────────────────
% 4. Report Numerical Results to Console
% ─────────────────────────────────────────────────────────────────────────
fprintf('\n===================================================================\n');
fprintf('                BIOMARKER EXTRACTION RESULTS\n');
fprintf('===================================================================\n');
fprintf(' Execution Time:              %.3f seconds\n', elapsed_sec);
fprintf(' -----------------------------------------------------------------\n');
fprintf(' 1. VASCULAR GEOMETRY & DENSITY:\n');
fprintf('    - Foreground Vessel Density:  %.2f %%\n', biomarkers.vessel_density * 100);
fprintf('    - Skeleton Branch Count:      %d branches\n', length(diagnostics.branch_details.lengths));
fprintf('\n 2. VESSEL TORTUOSITY:\n');
fprintf('    - Mean Tortuosity (Distance): %.4f (Distance metric: L/C - 1)\n', biomarkers.mean_tortuosity_distance);
fprintf('    - Mean Tortuosity (Curvature):%.4f (Curvature-squared integral, px^-2)\n', biomarkers.mean_tortuosity_curvature);
fprintf('    - Maximum Branch Tortuosity:  %.4f\n', biomarkers.max_tortuosity);
fprintf('\n 3. FRACTAL COMPLEXITY:\n');
fprintf('    - Skeleton Fractal Dim (D_f): %.4f (Skeleton range: 0.95 - 1.10; Mask range: 1.38 - 1.46)\n', biomarkers.fractal_dimension);
fprintf('    - Linearity of Fit (R^2):     %.4f\n', biomarkers.fractal_r_squared);
fprintf('\n 4. ARTERIOLAR-TO-VENULAR RATIO (AVR):\n');
fprintf('    - Optic Disc Radius Used:     %.1f pixels\n', diagnostics.estimated_od_radius);
fprintf('    - OD Radius Method:           %s\n', diagnostics.od_radius_method);
fprintf('    - Fallback Used:              %s\n', mat2str(diagnostics.od_radius_fallback_used));
if diagnostics.od_radius_fallback_used
    fprintf('    - Warning:                    %s\n', diagnostics.od_radius_warning);
end
fprintf('    - CRAE (Arteriolar Equiv):    %.2f pixels\n', biomarkers.crae_pixels);
fprintf('    - CRVE (Venular Equiv):       %.2f pixels\n', biomarkers.crve_pixels);
fprintf('    - Estimated AVR:              %.4f (Parr-Hubbard CRAE/CRVE)\n', biomarkers.avr);
fprintf('    - Disclaimer:                 %s\n', diagnostics.clinical_validation_disclaimer);
fprintf('===================================================================\n\n');

% ─────────────────────────────────────────────────────────────────────────
% 5. Render Multi-Panel Visual Diagnostics
% ─────────────────────────────────────────────────────────────────────────
fprintf('--> Rendering visual diagnostic figures...\n');

fig = figure('Name', 'RetinaAI - Retinal Biomarker Diagnostics (Phase 1)', ...
             'Color', 'w', 'Position', [80, 80, 1280, 800], 'Visible', 'on');

% Subplot 1: Fundus RGB with OD, Fovea, and Zone B Overlay
subplot(2, 3, 1);
imshow(fundus_rgb);
hold on;
plot(diagnostics.od_center(1), diagnostics.od_center(2), 'g+', 'MarkerSize', 14, 'LineWidth', 2);
legend_entries = {'Optic Disc'};
if ~any(isnan(diagnostics.fovea_center))
    plot(diagnostics.fovea_center(1), diagnostics.fovea_center(2), 'c+', 'MarkerSize', 14, 'LineWidth', 2);
    legend_entries{end+1} = 'Fovea';
end
visboundaries(diagnostics.zone_b_mask, 'Color', 'y', 'LineWidth', 1.5);
legend_entries{end+1} = 'Zone B';
if any(isnan(diagnostics.fovea_center))
    title({'1. Fundus RGB + OD / Zone B', '(Fovea Gated: Conf < 0.30)'}, 'FontSize', 9, 'FontWeight', 'bold');
else
    title('1. Fundus RGB + OD / Fovea / Zone B', 'FontSize', 10, 'FontWeight', 'bold');
end
legend(legend_entries, 'Location', 'southoutside', 'Orientation', 'horizontal');
hold off;

% Subplot 2: Vessel Mask & Thinned Skeleton
subplot(2, 3, 2);
skel_rgb = cat(3, uint8(diagnostics.skeleton_mask)*255, uint8(vessel_mask)*180, uint8(diagnostics.skeleton_mask)*255);
imshow(skel_rgb);
title(sprintf('2. Vessel Mask & Skeleton (D_f = %.3f)', biomarkers.fractal_dimension), ...
    'FontSize', 10, 'FontWeight', 'bold');

% Subplot 3: Zone B Annular Region
subplot(2, 3, 3);
zone_b_vessels = vessel_mask & diagnostics.zone_b_mask;
imshow(zone_b_vessels);
title('3. Extracted Vessels inside Zone B Annulus', 'FontSize', 10, 'FontWeight', 'bold');

% Subplot 4: Artery / Vein Classification
subplot(2, 3, 4);
av_overlay = zeros(H, W, 3, 'uint8');
av_overlay(:, :, 1) = uint8(diagnostics.artery_mask) * 255; % Red = Arterioles
av_overlay(:, :, 3) = uint8(diagnostics.vein_mask) * 255;   % Blue = Venules
% Blend with grayscale background
gray_bg = repmat(rgb2gray(fundus_rgb), [1, 1, 3]);
blended_av = uint8(0.6 * double(gray_bg) + 0.4 * double(av_overlay));
blended_av(repmat(diagnostics.artery_mask, [1, 1, 3])) = av_overlay(repmat(diagnostics.artery_mask, [1, 1, 3]));
blended_av(repmat(diagnostics.vein_mask, [1, 1, 3]))   = av_overlay(repmat(diagnostics.vein_mask, [1, 1, 3]));
imshow(blended_av);
title(sprintf('4. Artery/Vein Separation (AVR = %.3f)', biomarkers.avr), ...
    'FontSize', 10, 'FontWeight', 'bold');

% Subplot 5: Fractal Dimension Log-Log Regression
subplot(2, 3, 5);
bdata = diagnostics.box_counting_data;
plot(bdata.log_inv_s, bdata.log_N, 'ro', 'MarkerFaceColor', 'r', 'MarkerSize', 6);
hold on;
p_fit = polyfit(bdata.log_inv_s, bdata.log_N, 1);
fit_x = linspace(min(bdata.log_inv_s), max(bdata.log_inv_s), 50);
fit_y = polyval(p_fit, fit_x);
plot(fit_x, fit_y, 'b-', 'LineWidth', 2);
xlabel('log(1 / box\_size)');
ylabel('log(N\_boxes)');
title(sprintf('5. Fractal Log-Log Fit (D_f = %.3f, R^2 = %.3f)', ...
    biomarkers.fractal_dimension, biomarkers.fractal_r_squared), 'FontSize', 10, 'FontWeight', 'bold');
grid on;
legend({'Box Counts', 'Linear Fit'}, 'Location', 'northwest');
hold off;

% Subplot 6: Vessel Tortuosity Histogram / Distribution
subplot(2, 3, 6);
taus = diagnostics.branch_details.tau_distance;
if ~isempty(taus)
    histogram(taus, 15, 'FaceColor', [0.2, 0.6, 0.8], 'EdgeColor', 'k');
    xlabel('Branch Tortuosity Metric (\tau_d)');
    ylabel('Branch Count');
    title(sprintf('6. Tortuosity Distribution (Mean = %.3f)', biomarkers.mean_tortuosity_distance), ...
        'FontSize', 10, 'FontWeight', 'bold');
    grid on;
else
    text(0.5, 0.5, 'Insufficient branches for histogram', 'HorizontalAlignment', 'center');
end

% Save diagnostic figure to MATLAB folder
out_png = fullfile(script_dir, 'biomarker_diagnostic_output.png');
saveas(fig, out_png);
fprintf('--> Visual diagnostic output saved to:\n    %s\n', out_png);

fprintf('\n Standalone MATLAB verification complete.\n');

% ─────────────────────────────────────────────────────────────────────────
% HELPER FUNCTION FOR STANDALONE TESTING
% ─────────────────────────────────────────────────────────────────────────
function mask = adaptive_vessel_extract(img_rgb)
    % Fallback local vessel extraction on green channel if mask is not provided
    green = double(img_rgb(:, :, 2));
    % Contrast enhancement
    bg = imfilter(green, fspecial('gaussian', 31, 10));
    sub = bg - green;
    sub(sub < 0) = 0;
    sub_norm = sub / (max(sub(:)) + 1e-6);
    mask = (sub_norm > 0.18);
    % Remove tiny noise speckles
    mask = bwareaopen(mask, 30);
end

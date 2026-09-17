% RUN_VALIDATION_SUITE - 10-Image Standalone Validation Harness for Phase 1.5
%
% Executes retina_biomarkers.m across all 10 test screening samples,
% logging quantitative metrics, screening quality flags, and saving 6-panel
% diagnostic figures for each image without modifying any existing files.

clc;
clear;
close all;

script_dir = fileparts(mfilename('fullpath'));
val_data_dir = fullfile(script_dir, 'validation_data');
val_out_dir = fullfile(script_dir, 'validation_output');

if ~isfolder(val_out_dir)
    mkdir(val_out_dir);
end

manifest_file = fullfile(val_data_dir, 'validation_manifest.json');
if ~isfile(manifest_file)
    error('Validation manifest not found at %s. Run prepare_validation_inputs.py first.', manifest_file);
end

raw_manifest = fileread(manifest_file);
manifest = jsondecode(raw_manifest);

fprintf('========================================================================================\n');
fprintf(' RetinaAI: 10-Image Retinal Biomarker Phase 1.5 Validation Suite\n');
fprintf('========================================================================================\n\n');

num_samples = length(manifest);
results = cell(num_samples, 1);

for i = 1:num_samples
    item = manifest(i);
    fprintf('[%2d/%2d] Processing Sample: %s (%s eye)\n', i, num_samples, item.sample_id, upper(item.eye));
    
    % Ingest images
    fundus_rgb = imread(item.image_path);
    [H, W, ~] = size(fundus_rgb);
    
    vessel_mask = imread(item.mask_path);
    if size(vessel_mask, 3) > 1
        vessel_mask = vessel_mask(:, :, 1);
    end
    vessel_mask = (vessel_mask > 127);
    
    % Format landmarks (0-based Python -> 1-based MATLAB)
    if ~isempty(item.od_x) && ~isnan(item.od_x)
        od_center = [double(item.od_x) + 1.0, double(item.od_y) + 1.0];
    else
        od_center = [];
    end
    
    if ~isempty(item.fovea_x) && ~isnan(item.fovea_x)
        fovea_center = [double(item.fovea_x) + 1.0, double(item.fovea_y) + 1.0];
    else
        fovea_center = [NaN, NaN];
    end
    
    % Execute Biomarker Module
    t_start = tic;
    config = struct();
    config.debug = false;
    [biomarkers, diagnostics] = retina_biomarkers(vessel_mask, fundus_rgb, od_center, fovea_center, config);
    matlab_runtime = toc(t_start);
    
    % Compute binary mask fractal dimension for comparative reporting
    [df_mask, r2_mask] = compute_mask_fractal(vessel_mask, [16, 32, 64, 128]);
    
    % Zone B vessel count
    zone_b_vessels = vessel_mask & diagnostics.zone_b_mask;
    cc_zb = bwconncomp(zone_b_vessels, 8);
    zone_b_count = cc_zb.NumObjects;
    
    % Identify screening / quality flags
    quality_flags = {};
    if item.fovea_gated
        quality_flags{end+1} = 'FOV_GATED';
    end
    if diagnostics.od_radius_fallback_used
        quality_flags{end+1} = 'OD_PRIOR';
    end
    if zone_b_count < 6
        quality_flags{end+1} = 'LOW_ZB_COUNT';
    end
    if biomarkers.vessel_density < 0.06
        quality_flags{end+1} = 'LOW_DENSITY';
    end
    if isnan(biomarkers.avr) || biomarkers.avr < 0.35 || biomarkers.avr > 0.95
        quality_flags{end+1} = 'AVR_BORDERLINE';
    end
    if isempty(quality_flags)
        quality_flags{end+1} = 'NOMINAL';
    end
    flag_str = strjoin(quality_flags, '|');
    
    % Render 6-Panel Diagnostic Figure
    fig = figure('Name', sprintf('Diagnostics - %s', item.sample_id), ...
                 'Color', 'w', 'Position', [50, 50, 1280, 800], 'Visible', 'off');
    
    % Subplot 1: Fundus RGB + OD / Fovea / Zone B
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
        title({sprintf('1. %s (%s) - Fundus + OD', item.sample_id, upper(item.eye)), '(Fovea Gated: Conf < 0.30)'}, 'FontSize', 9, 'FontWeight', 'bold');
    else
        title(sprintf('1. %s (%s) - Fundus + OD/Fov', item.sample_id, upper(item.eye)), 'FontSize', 10, 'FontWeight', 'bold');
    end
    legend(legend_entries, 'Location', 'southoutside', 'Orientation', 'horizontal');
    hold off;
    
    % Subplot 2: Vessel Mask & Thinned Skeleton
    subplot(2, 3, 2);
    skel_rgb = cat(3, uint8(diagnostics.skeleton_mask)*255, uint8(vessel_mask)*180, uint8(diagnostics.skeleton_mask)*255);
    imshow(skel_rgb);
    title(sprintf('2. Skeleton (D_{f,skel} = %.3f, D_{f,mask} = %.3f)', biomarkers.fractal_dimension, df_mask), ...
        'FontSize', 10, 'FontWeight', 'bold');
    
    % Subplot 3: Zone B Annular Region
    subplot(2, 3, 3);
    imshow(zone_b_vessels);
    title(sprintf('3. Zone B Vessels (%d segments)', zone_b_count), 'FontSize', 10, 'FontWeight', 'bold');
    
    % Subplot 4: Artery / Vein Classification
    subplot(2, 3, 4);
    av_overlay = zeros(H, W, 3, 'uint8');
    av_overlay(:, :, 1) = uint8(diagnostics.artery_mask) * 255;
    av_overlay(:, :, 3) = uint8(diagnostics.vein_mask) * 255;
    gray_bg = repmat(rgb2gray(fundus_rgb), [1, 1, 3]);
    blended_av = uint8(0.6 * double(gray_bg) + 0.4 * double(av_overlay));
    blended_av(repmat(diagnostics.artery_mask, [1, 1, 3])) = av_overlay(repmat(diagnostics.artery_mask, [1, 1, 3]));
    blended_av(repmat(diagnostics.vein_mask, [1, 1, 3]))   = av_overlay(repmat(diagnostics.vein_mask, [1, 1, 3]));
    imshow(blended_av);
    title(sprintf('4. A/V Separation (AVR = %.3f)', biomarkers.avr), 'FontSize', 10, 'FontWeight', 'bold');
    
    % Subplot 5: Fractal Dimension Fit
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
    title(sprintf('5. Fractal Fit (D_f = %.3f, R^2 = %.4f)', ...
        biomarkers.fractal_dimension, biomarkers.fractal_r_squared), 'FontSize', 10, 'FontWeight', 'bold');
    grid on;
    legend({'Box Counts', 'Fit'}, 'Location', 'northwest');
    hold off;
    
    % Subplot 6: Tortuosity Distribution
    subplot(2, 3, 6);
    taus = diagnostics.branch_details.tau_distance;
    if ~isempty(taus)
        histogram(taus, 15, 'FaceColor', [0.2, 0.6, 0.8], 'EdgeColor', 'k');
        xlabel('Branch Tortuosity (\tau_d)');
        ylabel('Count');
        title(sprintf('6. Tortuosity (Mean = %.4f, Max = %.4f)', biomarkers.mean_tortuosity_distance, biomarkers.max_tortuosity), ...
            'FontSize', 10, 'FontWeight', 'bold');
        grid on;
    else
        text(0.5, 0.5, 'Insufficient branches', 'HorizontalAlignment', 'center');
    end
    
    out_fig_path = fullfile(val_out_dir, sprintf('diagnostic_%s.png', item.sample_id));
    saveas(fig, out_fig_path);
    close(fig);
    
    % Store record
    res_entry = struct();
    res_entry.sample_id        = item.sample_id;
    res_entry.eye              = item.eye;
    res_entry.od_x             = item.od_x;
    res_entry.od_y             = item.od_y;
    res_entry.od_conf          = item.od_conf;
    res_entry.fovea_x          = item.fovea_x;
    res_entry.fovea_y          = item.fovea_y;
    res_entry.fovea_conf       = item.fovea_conf;
    res_entry.fovea_gated      = item.fovea_gated;
    res_entry.vessel_density   = biomarkers.vessel_density;
    res_entry.branch_count     = length(diagnostics.branch_details.lengths);
    res_entry.zone_b_count     = zone_b_count;
    res_entry.tau_distance     = biomarkers.mean_tortuosity_distance;
    res_entry.tau_curvature    = biomarkers.mean_tortuosity_curvature;
    res_entry.tau_max          = biomarkers.max_tortuosity;
    res_entry.df_skel          = biomarkers.fractal_dimension;
    res_entry.r2_skel          = biomarkers.fractal_r_squared;
    res_entry.df_mask          = df_mask;
    res_entry.r2_mask          = r2_mask;
    res_entry.crae             = biomarkers.crae_pixels;
    res_entry.crve             = biomarkers.crve_pixels;
    res_entry.avr              = biomarkers.avr;
    res_entry.py_runtime       = item.py_runtime_sec;
    res_entry.matlab_runtime   = matlab_runtime;
    res_entry.total_runtime    = item.py_runtime_sec + matlab_runtime;
    res_entry.quality_flags    = flag_str;
    res_entry.fig_path         = out_fig_path;
    
    results{i} = res_entry;
    
    fprintf('       OD: [%.1f, %.1f] (c=%.2f) | Fov: Gated (c=%.2f)\n', ...
        diagnostics.od_center(1), diagnostics.od_center(2), item.od_conf, item.fovea_conf);
    fprintf('       Density: %.2f%% | Branches: %d | ZB: %d | Df_skel: %.4f | Df_mask: %.4f\n', ...
        biomarkers.vessel_density*100, res_entry.branch_count, zone_b_count, biomarkers.fractal_dimension, df_mask);
    fprintf('       CRAE: %.1f px | CRVE: %.1f px | AVR: %.4f | Time: %.2fs | Flags: %s\n\n', ...
        biomarkers.crae_pixels, biomarkers.crve_pixels, biomarkers.avr, res_entry.total_runtime, flag_str);
end

% Save JSON results
out_json_path = fullfile(val_out_dir, 'validation_results.json');
fid = fopen(out_json_path, 'w');
fprintf(fid, '%s', jsonencode(results, 'PrettyPrint', true));
fclose(fid);

fprintf('========================================================================================\n');
fprintf(' Validation complete. All 10 diagnostic figures saved to:\n %s\n', val_out_dir);
fprintf(' Results summary saved to:\n %s\n', out_json_path);
fprintf('========================================================================================\n');

% Helper to compute mask fractal dimension
function [D_f, R2] = compute_mask_fractal(mask, box_sizes)
    [H, W] = size(mask);
    valid_sizes = box_sizes(box_sizes < min(H, W) / 2);
    num_boxes = zeros(length(valid_sizes), 1);
    
    for k = 1:length(valid_sizes)
        s = valid_sizes(k);
        nH = ceil(H / s);
        nW = ceil(W / s);
        padded = false(nH * s, nW * s);
        padded(1:H, 1:W) = mask;
        cnt = 0;
        for r = 1:nH
            r_idx = (r-1)*s + 1 : r*s;
            for c = 1:nW
                c_idx = (c-1)*s + 1 : c*s;
                if any(padded(r_idx, c_idx), 'all')
                    cnt = cnt + 1;
                end
            end
        end
        num_boxes(k) = cnt;
    end
    
    log_inv_s = log(1.0 ./ double(valid_sizes(:)));
    log_N = log(double(num_boxes));
    p = polyfit(log_inv_s, log_N, 1);
    D_f = p(1);
    
    fitted_N = polyval(p, log_inv_s);
    ss_tot = sum((log_N - mean(log_N)).^2);
    ss_res = sum((log_N - fitted_N).^2);
    if ss_tot > 0
        R2 = 1.0 - (ss_res / ss_tot);
    else
        R2 = 1.0;
    end
end

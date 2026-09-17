function [biomarkers, diagnostic_struct] = retina_biomarkers(vessel_mask, fundus_rgb, od_center, fovea_center, config)
% RETINA_BIOMARKERS - Standalone Retinal Vascular Biomarker Computation Module
%
% Part of RetinaAI (SIH 26038) MATLAB/Simulink Integration Suite (Phase 1).
% Calculates research-grade biomarkers from segmented microvasculature:
%   1. Vessel Tortuosity (Distance metric and curvature-squared integral)
%   2. Vessel Fractal Dimension (Box-counting dimension D_f)
%   3. Arteriolar-to-Venular Ratio (AVR) with automated A/V color clustering
%
% DISCLAIMER:
%   This module is a research-grade computational prototype. The AVR and
%   automated A/V separation methods are NOT clinically validated and are
%   intended for algorithmic exploration and clinical decision-support research.
%
% SYNTAX:
%   [biomarkers, diagnostic_struct] = retina_biomarkers(vessel_mask, fundus_rgb, od_center, fovea_center, config)
%
% INPUTS:
%   vessel_mask  - [H x W] 2D binary or uint8 mask (0 = background, >0 = vessel)
%   fundus_rgb   - [H x W x 3] uint8 fundus photograph in standard RGB color space
%   od_center    - [1 x 2] double vector [x_od, y_od] in 1-based MATLAB coordinates
%   fovea_center - [1 x 2] double vector [x_fov, y_fov] in 1-based MATLAB coordinates (optional, can be [])
%   config       - (optional) struct with algorithm hyperparameters:
%                    .od_radius            - explicit OD radius in pixels (default: auto-detect)
%                    .box_sizes            - vector of box sizes for fractal dimension (default: [2 4 8 16 32 64 128])
%                    .min_branch_length    - minimum pixel length for tortuosity branches (default: 15)
%                    .zone_b_inner_factor  - inner Zone B radius as multiple of OD radius (default: 2.0)
%                    .zone_b_outer_factor  - outer Zone B radius as multiple of OD radius (default: 3.0)
%
% OUTPUTS:
%   biomarkers   - struct of scalar clinical research biomarkers:
%                    .avr                          - Arteriolar-to-Venular Ratio (CRAE / CRVE)
%                    .crae_pixels                  - Central Retinal Arteriolar Equivalent (pixels)
%                    .crve_pixels                  - Central Retinal Venular Equivalent (pixels)
%                    .mean_tortuosity_distance     - Length-weighted distance-metric tortuosity (tau_d >= 0)
%                    .mean_tortuosity_curvature    - Length-weighted curvature-integral tortuosity (tau_c >= 0)
%                    .max_tortuosity               - Maximum tortuosity observed among significant branches
%                    .fractal_dimension            - Box-counting dimension D_f (slope of log(N) vs log(1/s))
%                    .fractal_r_squared            - Coefficient of determination R^2 of fractal fit
%                    .vessel_density               - Foreground vascular density ratio (0.0 to 1.0)
%
%   diagnostic_struct - struct exposing intermediate masks and detection metadata:
%                    .estimated_od_radius          - Detected or fallback OD radius (pixels)
%                    .od_radius_method             - Method used: 'user_configured', 'circular_hough_transform', or 'fallback_geometric_prior'
%                    .od_radius_fallback_used      - Boolean flag indicating if fallback was used
%                    .od_radius_warning            - Descriptive warning string if fallback was engaged
%                    .zone_b_mask                  - [H x W] logical mask of the Parr-Hubbard Zone B annulus
%                    .artery_mask                  - [H x W] logical mask of classified arterioles
%                    .vein_mask                    - [H x W] logical mask of classified venules
%                    .skeleton_mask                - [H x W] logical mask of the thinned vessel skeleton
%                    .av_separation_method         - String describing the automated A/V classification technique
%                    .clinical_validation_disclaimer - Clinical disclaimer string
%                    .box_counting_data            - Struct with box sizes, counts, and log-log regression points
%                    .od_center                    - [1 x 2] OD center coordinates used [x, y]
%                    .fovea_center                 - [1 x 2] Fovea center coordinates used [x, y]

    % ─────────────────────────────────────────────────────────────────────
    % 1. Input Validation, Harmonization & Coordinate Standardization
    % ─────────────────────────────────────────────────────────────────────
    if nargin < 1 || isempty(vessel_mask)
        error('retina_biomarkers:InvalidInput', 'vessel_mask is a required input.');
    end

    % Standardize vessel_mask to 2D logical
    if ~islogical(vessel_mask)
        vessel_mask = (vessel_mask > 127);
    end
    [H, W] = size(vessel_mask);

    % Standardize fundus_rgb
    if nargin < 2 || isempty(fundus_rgb)
        % If fundus_rgb is omitted, synthesize RGB from vessel mask for structural metrics
        fundus_rgb = repmat(uint8(vessel_mask) * 255, [1, 1, 3]);
    else
        if size(fundus_rgb, 3) == 1
            fundus_rgb = repmat(fundus_rgb, [1, 1, 3]);
        end
        % Ensure spatial dimensions match
        if size(fundus_rgb, 1) ~= H || size(fundus_rgb, 2) ~= W
            fundus_rgb = imresize(fundus_rgb, [H, W]);
        end
    end

    % Standardize configuration
    if nargin < 5 || isempty(config)
        config = struct();
    end
    if ~isfield(config, 'box_sizes'), config.box_sizes = [2, 4, 8, 16, 32, 64, 128]; end
    if ~isfield(config, 'min_branch_length'), config.min_branch_length = 15; end
    if ~isfield(config, 'zone_b_inner_factor'), config.zone_b_inner_factor = 2.0; end
    if ~isfield(config, 'zone_b_outer_factor'), config.zone_b_outer_factor = 3.0; end

    % Standardize Optic Disc Center
    od_estimated_flag = false;
    if nargin < 3 || isempty(od_center) || any(isnan(od_center)) || od_center(1) < 1 || od_center(1) > W || od_center(2) < 1 || od_center(2) > H
        od_center = estimate_od_center_heuristic(fundus_rgb, vessel_mask);
        od_estimated_flag = true;
    else
        od_center = [double(od_center(1)), double(od_center(2))];
    end

    % Standardize Fovea Center
    if nargin < 4 || isempty(fovea_center) || any(isnan(fovea_center))
        fovea_center = [NaN, NaN];
    else
        fovea_center = [double(fovea_center(1)), double(fovea_center(2))];
    end

    % ─────────────────────────────────────────────────────────────────────
    % 2. Optic Disc Radius ($R_{\text{disc}}$) Estimation & Fallback Handling
    % ─────────────────────────────────────────────────────────────────────
    od_radius_fallback_used = false;
    od_radius_warning = '';

    if isfield(config, 'od_radius') && ~isempty(config.od_radius) && config.od_radius > 0
        od_radius = double(config.od_radius);
        od_radius_method = 'user_configured';
    else
        [od_radius, detect_success] = estimate_od_radius_hough(fundus_rgb, od_center);
        if detect_success
            od_radius_method = 'circular_hough_transform';
        else
            % Explicit Fallback: 7.5% of the minimum image dimension (standard physiological ratio)
            od_radius = round(0.075 * min(H, W));
            od_radius_method = 'fallback_geometric_prior';
            od_radius_fallback_used = true;
            od_radius_warning = sprintf('Image-based OD boundary detection unconfident. Fallback geometric prior (7.5%% of min-dim = %.1f px) engaged.', od_radius);
        end
    end

    % ─────────────────────────────────────────────────────────────────────
    % 3. Vessel Skeletonization
    % ─────────────────────────────────────────────────────────────────────
    skeleton_mask = compute_skeleton(vessel_mask);

    % Global vascular density
    vessel_density = double(sum(vessel_mask(:))) / double(H * W);

    % ─────────────────────────────────────────────────────────────────────
    % 4. Biomarker 1: Vessel Tortuosity (Distance Metric & Curvature)
    % ─────────────────────────────────────────────────────────────────────
    [mean_tau_d, mean_tau_c, max_tau, branch_details] = compute_tortuosity(skeleton_mask, config.min_branch_length);

    % ─────────────────────────────────────────────────────────────────────
    % 5. Biomarker 2: Fractal Dimension ($D_f$) via Box Counting
    % ─────────────────────────────────────────────────────────────────────
    [fractal_dim, fractal_r2, box_data] = compute_fractal_dimension(skeleton_mask, config.box_sizes);

    % ─────────────────────────────────────────────────────────────────────
    % 6. Biomarker 3: Zone B Masking, Automated A/V Separation & AVR
    % ─────────────────────────────────────────────────────────────────────
    [zone_b_mask, artery_mask, vein_mask, crae, crve, avr] = compute_avr_and_av_separation(...
        vessel_mask, skeleton_mask, fundus_rgb, od_center, od_radius, config);

    % Branch and Zone B counts
    branch_count = length(branch_details.lengths);
    zone_b_vessels = vessel_mask & zone_b_mask;
    cc_zb = bwconncomp(zone_b_vessels, 8);
    zone_b_count = cc_zb.NumObjects;

    % ─────────────────────────────────────────────────────────────────────
    % 7. Assemble Structured Outputs
    % ─────────────────────────────────────────────────────────────────────
    biomarkers = struct();
    biomarkers.avr                       = avr;
    biomarkers.crae_pixels               = crae;
    biomarkers.crve_pixels               = crve;
    biomarkers.mean_tortuosity_distance  = mean_tau_d;
    biomarkers.mean_tortuosity_curvature = mean_tau_c;
    biomarkers.max_tortuosity            = max_tau;
    biomarkers.fractal_dimension         = fractal_dim;
    biomarkers.fractal_r_squared         = fractal_r2;
    biomarkers.vessel_density            = vessel_density;
    biomarkers.zone_b_count              = zone_b_count;
    biomarkers.branch_count              = branch_count;

    if nargout > 1
        diagnostic_struct = struct();
        diagnostic_struct.estimated_od_radius          = od_radius;
        diagnostic_struct.od_radius_method             = od_radius_method;
        diagnostic_struct.od_radius_fallback_used      = od_radius_fallback_used;
        diagnostic_struct.od_radius_warning            = od_radius_warning;
        diagnostic_struct.od_center_was_estimated      = od_estimated_flag;
        diagnostic_struct.od_center                    = od_center;
        diagnostic_struct.fovea_center                 = fovea_center;
        diagnostic_struct.zone_b_mask                  = zone_b_mask;
        diagnostic_struct.artery_mask                  = artery_mask;
        diagnostic_struct.vein_mask                    = vein_mask;
        diagnostic_struct.skeleton_mask                = skeleton_mask;
        diagnostic_struct.branch_details               = branch_details;
        diagnostic_struct.box_counting_data            = box_data;
        diagnostic_struct.av_separation_method         = 'Green-channel reflectance, R/G intensity ratio, and distance-transform caliber clustering in Zone B';
        diagnostic_struct.clinical_validation_disclaimer = 'Research prototype only. Not clinically validated for diagnostic decision support.';
    else
        diagnostic_struct = [];
    end
end

% ═════════════════════════════════════════════════════════════════════════
% LOCAL SUBFUNCTIONS
% ═════════════════════════════════════════════════════════════════════════

function skel = compute_skeleton(mask)
    % Robust skeletonization with fallback if bwskel is unavailable
    if exist('bwskel', 'file') == 2
        skel = bwskel(mask);
    else
        skel = bwmorph(mask, 'thin', Inf);
    end
end

function [od_center] = estimate_od_center_heuristic(fundus_rgb, vessel_mask)
    % Fallback optic disc center estimation if not provided by deep learning:
    % Identifies the high-luminance circular convergence zone of vessels.
    [H, W, ~] = size(fundus_rgb);
    red_ch = double(fundus_rgb(:, :, 1));
    
    % Mask out non-retinal dark borders
    retina_mask = (red_ch > 15);
    
    % Heavy smoothing to isolate large bright optic disc structure
    smooth_disk = imfilter(red_ch, fspecial('gaussian', round(0.08 * min(H, W)), round(0.04 * min(H, W))));
    smooth_disk(~retina_mask) = 0;
    
    % Find brightest centroid
    [~, max_idx] = max(smooth_disk(:));
    [y_od, x_od] = ind2sub([H, W], max_idx);
    od_center = [double(x_od), double(y_od)];
end

function [od_radius, success] = estimate_od_radius_hough(fundus_rgb, od_center)
    % Attempts Circular Hough Transform (imfindcircles) centered on od_center
    [H, W, ~] = size(fundus_rgb);
    red_ch = fundus_rgb(:, :, 1);
    
    r_min = round(0.035 * min(H, W));
    r_max = round(0.120 * min(H, W));
    
    od_radius = round(0.075 * min(H, W));
    success = false;
    
    if exist('imfindcircles', 'file') == 2 && r_min >= 5 && r_max > r_min
        try
            % Crop search region around od_center
            search_pad = round(r_max * 2.2);
            x1 = max(1, round(od_center(1) - search_pad));
            y1 = max(1, round(od_center(2) - search_pad));
            x2 = min(W, round(od_center(1) + search_pad));
            y2 = min(H, round(od_center(2) + search_pad));
            
            crop_patch = red_ch(y1:y2, x1:x2);
            [centers, radii, metric] = imfindcircles(crop_patch, [r_min, r_max], ...
                'ObjectPolarity', 'bright', 'Sensitivity', 0.85);
            
            if ~isempty(radii) && metric(1) > 0.15
                od_radius = radii(1);
                success = true;
            end
        catch
            success = false;
        end
    end
end

function [mean_tau_d, mean_tau_c, max_tau, branch_details] = compute_tortuosity(skel, min_len)
    % Decomposes skeleton into isolated branches and computes distance & curvature metrics
    branch_pts = bwmorph(skel, 'branchpoints');
    
    % Disconnect branch points to isolate independent segments
    branches = skel & ~imdilate(branch_pts, ones(3));
    cc = bwconncomp(branches, 8);
    
    tau_d_list = [];
    tau_c_list = [];
    len_list = [];
    
    for i = 1:cc.NumObjects
        seg_idx = cc.PixelIdxList{i};
        L = length(seg_idx);
        if L < min_len
            continue;
        end
        
        [H_im, ~] = size(skel);
        [ys, xs] = ind2sub([H_im, size(skel, 2)], seg_idx);
        
        % Endpoints Euclidean chord length C
        % Approximate endpoints using the pair with maximum pairwise distance
        dx = xs - xs';
        dy = ys - ys';
        dist_sq = dx.^2 + dy.^2;
        [max_dist_sq, max_pair_idx] = max(dist_sq(:));
        C = sqrt(max_dist_sq);
        
        if C >= 1.0
            tau_d = max(0.0, (double(L) / double(C)) - 1.0);
        else
            tau_d = 0.0;
        end
        
        % Order points along the curve for curvature integration
        % Simple nearest-neighbor walk starting from first endpoint
        [p1, ~] = ind2sub(size(dist_sq), max_pair_idx);
        ordered_x = zeros(L, 1);
        ordered_y = zeros(L, 1);
        remaining = true(L, 1);
        
        curr = p1;
        ordered_x(1) = xs(curr);
        ordered_y(1) = ys(curr);
        remaining(curr) = false;
        
        for step = 2:L
            dists = (xs(remaining) - ordered_x(step-1)).^2 + (ys(remaining) - ordered_y(step-1)).^2;
            [~, next_local] = min(dists);
            rem_indices = find(remaining);
            curr = rem_indices(next_local);
            ordered_x(step) = xs(curr);
            ordered_y(step) = ys(curr);
            remaining(curr) = false;
        end
        
        % Numerical derivatives (smoothed)
        if L >= 5
            dx_dt = gradient(ordered_x);
            dy_dt = gradient(ordered_y);
            d2x_dt2 = gradient(dx_dt);
            d2y_dt2 = gradient(dy_dt);
            
            numerator = abs(dx_dt .* d2y_dt2 - dy_dt .* d2x_dt2);
            denominator = (dx_dt.^2 + dy_dt.^2).^(1.5) + 1e-6;
            curvature = numerator ./ denominator;
            tau_c = (1.0 / double(L)) * sum(curvature.^2);
        else
            tau_c = 0.0;
        end
        
        tau_d_list(end+1) = tau_d; %#ok<AGROW>
        tau_c_list(end+1) = tau_c; %#ok<AGROW>
        len_list(end+1) = L;       %#ok<AGROW>
    end
    
    if isempty(len_list)
        mean_tau_d = 0.0;
        mean_tau_c = 0.0;
        max_tau = 0.0;
    else
        total_len = sum(len_list);
        mean_tau_d = sum(tau_d_list .* len_list) / total_len;
        mean_tau_c = sum(tau_c_list .* len_list) / total_len;
        max_tau = max(tau_d_list);
    end
    
    branch_details = struct('lengths', len_list, 'tau_distance', tau_d_list, 'tau_curvature', tau_c_list);
end

function [D_f, R2, box_data] = compute_fractal_dimension(skel, box_sizes)
    % Multi-scale box-counting algorithm on skeletonized vasculature
    [H, W] = size(skel);
    valid_sizes = box_sizes(box_sizes < min(H, W) / 2);
    if length(valid_sizes) < 3
        valid_sizes = [4, 8, 16, 32, 64];
    end
    
    num_boxes = zeros(length(valid_sizes), 1);
    
    for i = 1:length(valid_sizes)
        s = valid_sizes(i);
        nH = ceil(H / s);
        nW = ceil(W / s);
        
        % Pad to multiple of s
        padded = false(nH * s, nW * s);
        padded(1:H, 1:W) = skel;
        
        % Block processing count
        count = 0;
        for r = 1:nH
            r_idx = (r-1)*s + 1 : r*s;
            for c = 1:nW
                c_idx = (c-1)*s + 1 : c*s;
                if any(padded(r_idx, c_idx), 'all')
                    count = count + 1;
                end
            end
        end
        num_boxes(i) = count;
    end
    
    % Linear regression on log-log coordinates
    log_inv_s = log(1.0 ./ double(valid_sizes(:)));
    log_N = log(double(num_boxes));
    
    p = polyfit(log_inv_s, log_N, 1);
    D_f = p(1);
    
    % Goodness of fit (R^2)
    fitted_N = polyval(p, log_inv_s);
    ss_tot = sum((log_N - mean(log_N)).^2);
    ss_res = sum((log_N - fitted_N).^2);
    if ss_tot > 0
        R2 = 1.0 - (ss_res / ss_tot);
    else
        R2 = 1.0;
    end
    
    box_data = struct('box_sizes', valid_sizes, 'box_counts', num_boxes, ...
                      'log_inv_s', log_inv_s, 'log_N', log_N, 'slope', D_f, 'r_squared', R2);
end

function [zone_b_mask, artery_mask, vein_mask, crae, crve, avr] = compute_avr_and_av_separation(...
    vessel_mask, skel, fundus_rgb, od_center, od_radius, config)
    % Constructs Zone B annulus and classifies vessels into Arterioles and Venules
    [H, W, ~] = size(vessel_mask);
    
    % 1. Construct Zone B annulus
    r_inner = config.zone_b_inner_factor * od_radius;
    r_outer = config.zone_b_outer_factor * od_radius;
    
    [X, Y] = meshgrid(1:W, 1:H);
    dist_od = sqrt((X - od_center(1)).^2 + (Y - od_center(2)).^2);
    zone_b_mask = (dist_od >= r_inner) & (dist_od <= r_outer);
    
    vessels_zone_b = vessel_mask & zone_b_mask;
    skel_zone_b = skel & zone_b_mask;
    
    % Compute local vessel calibers via Euclidean distance transform
    dist_transform = bwdist(~vessel_mask);
    
    % Initialize output masks
    artery_mask = false(H, W);
    vein_mask = false(H, W);
    
    % 2. Automated Artery/Vein Classification inside Zone B
    cc = bwconncomp(vessels_zone_b, 8);
    
    if cc.NumObjects < 2
        % Insufficient vascular connectivity in Zone B
        crae = NaN;
        crve = NaN;
        avr = NaN;
        return;
    end
    
    green_ch = double(fundus_rgb(:, :, 2));
    red_ch   = double(fundus_rgb(:, :, 1));
    
    segment_features = []; % [mean_green, mean_caliber, red_green_ratio]
    valid_components = [];
    
    for i = 1:cc.NumObjects
        pix = cc.PixelIdxList{i};
        if length(pix) < 15
            continue;
        end
        
        % Extract skeleton points belonging to this component
        comp_skel = pix(skel(pix));
        if isempty(comp_skel)
            comp_skel = pix;
        end
        
        m_green = mean(green_ch(comp_skel));
        m_red   = mean(red_ch(comp_skel));
        m_cal   = 2.0 * mean(dist_transform(comp_skel)); % Caliber in pixels
        rg_ratio = m_red / (m_green + 1e-4);
        
        segment_features(end+1, :) = [m_green, m_cal, rg_ratio]; %#ok<AGROW>
        valid_components(end+1) = i;                              %#ok<AGROW>
    end
    
    if size(segment_features, 1) < 2
        crae = NaN;
        crve = NaN;
        avr = NaN;
        return;
    end
    
    % Feature normalization for clustering
    feat_norm = (segment_features - mean(segment_features, 1)) ./ (std(segment_features, 0, 1) + 1e-6);
    
    % 2-class clustering: Arterioles vs Venules
    % Physiological rule: Arterioles have higher green luminance and narrower caliber
    % We construct a scoring index: score = normalized(Green) - normalized(Caliber)
    % Higher score -> Artery, Lower score -> Vein
    av_score = feat_norm(:, 1) - 0.8 * feat_norm(:, 2);
    
    median_score = median(av_score);
    is_artery = (av_score >= median_score);
    
    arteriolar_calibers = [];
    venular_calibers = [];
    
    for k = 1:length(valid_components)
        comp_id = valid_components(k);
        pix = cc.PixelIdxList{comp_id};
        cal = segment_features(k, 2);
        
        if is_artery(k)
            artery_mask(pix) = true;
            arteriolar_calibers(end+1) = cal; %#ok<AGROW>
        else
            vein_mask(pix) = true;
            venular_calibers(end+1) = cal;     %#ok<AGROW>
        end
    end
    
    % 3. Parr-Hubbard-Knudtson CRAE and CRVE calculation
    crae = compute_hubbard_equivalent(arteriolar_calibers, 'artery');
    crve = compute_hubbard_equivalent(venular_calibers, 'vein');
    
    if ~isnan(crae) && ~isnan(crve) && crve > 0
        avr = crae / crve;
    else
        avr = NaN;
    end
end

function W = compute_hubbard_equivalent(calibers, type)
    % Implements the Parr-Hubbard iterative pairing formula
    if isempty(calibers)
        W = NaN;
        return;
    end
    
    % Sort descending
    s = sort(calibers, 'descend');
    
    % Limit to top 6 vessels as per clinical protocol
    if length(s) > 6
        s = s(1:6);
    end
    
    % Iterative pairing
    while length(s) > 1
        w1 = s(1); % larger
        w2 = s(2); % smaller
        
        if strcmp(type, 'artery')
            w_comb = sqrt(0.87 * (w1^2) + 1.01 * (w2^2) - 0.22 * w1 * w2 - 10.73);
        else
            % Venous formula
            w_comb = sqrt(0.72 * (w1^2) + 0.91 * (w2^2) + 450.05);
        end
        
        if imag(w_comb) ~= 0 || isnan(w_comb)
            w_comb = sqrt(0.5 * (w1^2 + w2^2)); % Safe geometric fallback
        end
        
        % Replace top two with combined, resort
        s = sort([w_comb, s(3:end)], 'descend');
    end
    
    W = s(1);
end

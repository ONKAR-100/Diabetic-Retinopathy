function sim_result = run_retina_simulation(biomarkers_in, opts)
% RUN_RETINA_SIMULATION Standalone executor for retina_computational_state.slx
%
% Part of RetinaAI Phase 7: Simulink Retinal Computational State-Space Modeling.
%
% CONTRACT VERSION: 1.0.0
% MODEL VERSION:    1.0.0
%
% DISCLAIMER:
%   This module produces engineering computational state outputs only.
%   Simulation time theta in [0, 10] is dimensionless computational relaxation
%   time and has NO relation to biological time, disease progression, or aging.
%   Outputs must NOT be interpreted as clinical risk, DR severity, or diagnostic scores.
%
% SYNTAX:
%   sim_result = run_retina_simulation(biomarkers_in)
%   sim_result = run_retina_simulation(biomarkers_in, opts)
%
% INPUTS:
%   biomarkers_in - struct containing Phase 6 biomarker fields:
%                     .vessel_density           (or .V_d)
%                     .branch_count             (or .N_branch)
%                     .zone_b_count             (or .N_zb)
%                     .mean_tortuosity_distance (or .tau_distance, .tau_d)
%                     .mean_tortuosity_curvature(or .tau_curvature, .tau_c)
%                     .fractal_dimension        (or .df_skel, .Df)
%                     .fractal_r_squared        (or .r2_skel, .R2)
%   opts          - (optional) struct:
%                     .downsample_step (default: 1, i.e., all 101 points; 2 = 51 pts)
%                     .model_name      (default: 'retina_computational_state')
%
% OUTPUTS:
%   sim_result    - struct with fields:
%                     .status             ('completed', 'invalid_input', 'error')
%                     .error_message      (char or empty)
%                     .model_name         ('retina_computational_state')
%                     .model_version      ('1.0.0')
%                     .contract_version   ('1.0.0')
%                     .raw_inputs         (struct of parsed inputs)
%                     .normalized_inputs  (struct of normalized [0, 1] inputs)
%                     .output_state       (struct of terminal bounded states)
%                     .trajectory         (struct of time-series curves over theta)
%                     .runtime_seconds    (execution time)
%                     .scientific_disclaimer (mandatory disclaimer string)

    t_start = tic;

    if nargin < 2 || isempty(opts)
        opts = struct();
    end
    if ~isfield(opts, 'downsample_step'), opts.downsample_step = 1; end
    if ~isfield(opts, 'model_name'), opts.model_name = 'retina_computational_state'; end

    disclaimer_text = ['Research/computational modeling prototype only. States reflect ', ...
        'mathematical continuous state-space dynamics over dimensionless relaxation time ', ...
        'theta in [0, 10] and do NOT represent clinical risk, DR grade, disease progression, ', ...
        'or biological time.'];

    % Default error template
    sim_result = struct(...
        'status', 'invalid_input', ...
        'error_message', '', ...
        'model_name', opts.model_name, ...
        'model_version', '1.0.0', ...
        'contract_version', '1.0.0', ...
        'raw_inputs', struct(), ...
        'normalized_inputs', struct(), ...
        'output_state', struct(), ...
        'trajectory', struct(), ...
        'runtime_seconds', 0.0, ...
        'scientific_disclaimer', disclaimer_text);

    % ─────────────────────────────────────────────────────────────────────
    % 1. Input Validation & Strict Integrity Gate
    % ─────────────────────────────────────────────────────────────────────
    if nargin < 1 || isempty(biomarkers_in) || ~isstruct(biomarkers_in)
        sim_result.error_message = 'Invalid input: biomarkers_in must be a non-empty struct.';
        sim_result.runtime_seconds = toc(t_start);
        return;
    end

    % Helper for multi-alias field extraction
    function val = get_field_val(s, aliases)
        val = [];
        for k = 1:length(aliases)
            alias = aliases{k};
            if isfield(s, alias) && ~isempty(s.(alias))
                val = double(s.(alias));
                return;
            end
        end
    end

    v_dens   = get_field_val(biomarkers_in, {'vessel_density', 'V_d'});
    n_branch = get_field_val(biomarkers_in, {'branch_count', 'N_branch'});
    n_zb     = get_field_val(biomarkers_in, {'zone_b_count', 'N_zb'});
    tau_d    = get_field_val(biomarkers_in, {'mean_tortuosity_distance', 'tau_distance', 'tau_d'});
    tau_c    = get_field_val(biomarkers_in, {'mean_tortuosity_curvature', 'tau_curvature', 'tau_c'});
    df_val   = get_field_val(biomarkers_in, {'fractal_dimension', 'df_skel', 'Df'});
    r2_val   = get_field_val(biomarkers_in, {'fractal_r_squared', 'r2_skel', 'R2'});

    % Validate presence and finite numeric ranges
    fields_check = {
        'vessel_density', v_dens, 0.0, 1.0;
        'branch_count', n_branch, 0.0, Inf;
        'zone_b_count', n_zb, 0.0, Inf;
        'mean_tortuosity_distance', tau_d, 0.0, Inf;
        'mean_tortuosity_curvature', tau_c, 0.0, Inf;
        'fractal_dimension', df_val, 0.0, 3.0;
        'fractal_r_squared', r2_val, 0.0, 1.0
    };

    for i = 1:size(fields_check, 1)
        name = fields_check{i, 1};
        val  = fields_check{i, 2};
        min_v = fields_check{i, 3};
        max_v = fields_check{i, 4};

        if isempty(val) || isnan(val) || isinf(val)
            sim_result.error_message = sprintf('Invalid input: field "%s" is missing, NaN, or non-finite.', name);
            sim_result.runtime_seconds = toc(t_start);
            return;
        end
        if val < min_v || val > max_v
            sim_result.error_message = sprintf('Out-of-range input: field "%s" = %g outside valid range [%g, %g].', name, val, min_v, max_v);
            sim_result.runtime_seconds = toc(t_start);
            return;
        end
    end

    % Record validated raw inputs
    raw_s = struct(...
        'vessel_density', v_dens, ...
        'branch_count', round(n_branch), ...
        'zone_b_count', round(n_zb), ...
        'mean_tortuosity_distance', tau_d, ...
        'mean_tortuosity_curvature', tau_c, ...
        'fractal_dimension', df_val, ...
        'fractal_r_squared', r2_val);
    sim_result.raw_inputs = raw_s;

    % ─────────────────────────────────────────────────────────────────────
    % 2. Canonical Normalization Contract (v1.0.0)
    % ─────────────────────────────────────────────────────────────────────
    clamp = @(x, lo, hi) min(hi, max(lo, x));

    u_dens      = clamp(v_dens / 0.20, 0.0, 1.0);
    u_branch    = clamp(n_branch / 500.0, 0.0, 1.0);
    u_zb        = clamp(n_zb / 30.0, 0.0, 1.0);
    u_taud      = clamp(tau_d / 0.04, 0.0, 1.0);
    u_tauc      = clamp(tau_c / 0.30, 0.0, 1.0);
    u_df_raw    = clamp((df_val - 0.85) / 0.35, 0.0, 1.0);
    w_fit       = clamp((r2_val - 0.90) / 0.10, 0.0, 1.0);
    u_df_star   = w_fit * u_df_raw + (1.0 - w_fit) * 0.50;

    norm_s = struct(...
        'u_dens', round(u_dens, 6), ...
        'u_branch', round(u_branch, 6), ...
        'u_zb', round(u_zb, 6), ...
        'u_taud', round(u_taud, 6), ...
        'u_tauc', round(u_tauc, 6), ...
        'u_df_raw', round(u_df_raw, 6), ...
        'w_fit', round(w_fit, 6), ...
        'u_df_star', round(u_df_star, 6));
    sim_result.normalized_inputs = norm_s;

    % Input vector for Simulink: [6 x 1]
    u_vec = [u_dens; u_branch; u_zb; u_taud; u_tauc; u_df_star];

    % ─────────────────────────────────────────────────────────────────────
    % 3. Model Loading & Verification
    % ─────────────────────────────────────────────────────────────────────
    mdl = opts.model_name;
    script_dir = fileparts(mfilename('fullpath'));
    slx_file = fullfile(script_dir, [mdl, '.slx']);

    if exist(slx_file, 'file') ~= 4 && exist(slx_file, 'file') ~= 2
        % Programmatically build if missing
        build_retina_simulink_model(script_dir);
    end

    if ~bdIsLoaded(mdl)
        load_system(slx_file);
    end

    % ─────────────────────────────────────────────────────────────────────
    % 4. Simulink Execution
    % ─────────────────────────────────────────────────────────────────────
    try
        simIn = Simulink.SimulationInput(mdl);
        u_ts = timeseries(repmat(u_vec', [2, 1]), [0.0, 10.0]);
        simIn = simIn.setExternalInput(u_ts);
        
        simOut = sim(simIn);

        % Extract tout and yout
        t_vec = simOut.tout; % [101 x 1]
        raw_states = simOut.yout{1}.Values.Data; % [101 x 3]

        % ─────────────────────────────────────────────────────────────────
        % 5. Output Clamping & State Computations
        % ─────────────────────────────────────────────────────────────────
        % Explicitly clamp state trajectory to [0.0, 1.0] for displayed state
        bounded_states = min(1.0, max(0.0, raw_states));

        % Terminal states at theta = 10.0
        final_raw = raw_states(end, :);
        final_bounded = bounded_states(end, :);

        s_complexity = final_bounded(1);
        s_tortuosity = final_bounded(2);
        s_density    = final_bounded(3);

        % Composite Retinal Computational State: Euclidean norm scaled by 1/sqrt(3)
        s_composite  = (1.0 / sqrt(3.0)) * sqrt(s_complexity^2 + s_tortuosity^2 + s_density^2);
        s_composite  = min(1.0, max(0.0, s_composite));

        out_s = struct(...
            'structural_complexity_state', round(s_complexity, 6), ...
            'tortuosity_computational_state', round(s_tortuosity, 6), ...
            'vascular_bed_density_state', round(s_density, 6), ...
            'composite_retinal_computational_state', round(s_composite, 6), ...
            'raw_unclamped_state', round(final_raw, 6));
        sim_result.output_state = out_s;

        % ─────────────────────────────────────────────────────────────────
        % 6. Trajectory Packaging (Downsampled for web serialization)
        % ─────────────────────────────────────────────────────────────────
        step = max(1, round(opts.downsample_step));
        idx = 1:step:length(t_vec);
        if idx(end) ~= length(t_vec)
            idx = [idx, length(t_vec)];
        end

        sim_result.trajectory = struct(...
            'theta', round(t_vec(idx)', 2), ...
            'complexity_curve', round(bounded_states(idx, 1)', 6), ...
            'tortuosity_curve', round(bounded_states(idx, 2)', 6), ...
            'density_curve', round(bounded_states(idx, 3)', 6));

        sim_result.status = 'completed';
        sim_result.error_message = '';

    catch ME
        sim_result.status = 'error';
        sim_result.error_message = sprintf('Simulink execution failed: %s', ME.message);
    end

    sim_result.runtime_seconds = round(toc(t_start), 4);
end

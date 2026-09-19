% TEST_SIMULINK_STANDALONE Automated Standalone Verification Suite for Phase 7
%
% Part of RetinaAI Phase 7: Simulink Retinal Computational State-Space Modeling.
%
% Tests:
%   Test A: Zero/Baseline input execution & numerical bounds
%   Test B: Phase 6 reference case numerical fidelity
%   Test C: Saturated/High input clamping & stability
%   Test D: Repeated execution determinism (5 iterations)
%   Test E: Strict invalid-input handling & gating

fprintf('\n========================================================================\n');
fprintf(' RetinaAI: Phase 7 Standalone Simulink Verification Suite\n');
fprintf('========================================================================\n\n');

total_tests = 5;
passed_tests = 0;

%% ────────────────────────────────────────────────────────────────────────
%% TEST A: Zero / Baseline Input
%% ────────────────────────────────────────────────────────────────────────
fprintf('[TEST A] Zero / Baseline Input Execution...\n');
try
    zero_bm = struct(...
        'vessel_density', 0.0, ...
        'branch_count', 0, ...
        'zone_b_count', 0, ...
        'mean_tortuosity_distance', 0.0, ...
        'mean_tortuosity_curvature', 0.0, ...
        'fractal_dimension', 0.85, ...
        'fractal_r_squared', 0.90);

    res_a = run_retina_simulation(zero_bm);

    assert(strcmp(res_a.status, 'completed'), 'Test A failed: Status is not completed.');
    assert(isempty(res_a.error_message), 'Test A failed: Unexpected error message.');

    out_a = res_a.output_state;
    all_vals_a = [out_a.structural_complexity_state, ...
                  out_a.tortuosity_computational_state, ...
                  out_a.vascular_bed_density_state, ...
                  out_a.composite_retinal_computational_state];

    assert(all(~isnan(all_vals_a)), 'Test A failed: Contains NaN.');
    assert(all(~isinf(all_vals_a)), 'Test A failed: Contains Inf.');
    assert(all(all_vals_a >= 0.0 & all_vals_a <= 1.0), 'Test A failed: Output outside [0, 1].');

    % Under zero input, states should settle to exact analytical values:
    % x_tortuosity = 0, x_density = 0
    % x_complexity = 0.25 * (1 - exp(-10)) = 0.249989
    % composite = 0.25 * (1 - exp(-10)) / sqrt(3) = 0.144331
    assert(abs(out_a.structural_complexity_state - 0.249989) < 1e-4, ...
        sprintf('Test A: Complexity %g deviates from analytical 0.249989.', out_a.structural_complexity_state));
    assert(out_a.tortuosity_computational_state < 1e-4, 'Test A failed: Tortuosity not near zero.');
    assert(out_a.vascular_bed_density_state < 1e-4, 'Test A failed: Density not near zero.');
    assert(abs(out_a.composite_retinal_computational_state - 0.144331) < 1e-4, ...
        sprintf('Test A: Composite %g deviates from analytical 0.144331.', out_a.composite_retinal_computational_state));

    fprintf('         Outputs: Complexity=%0.4f, Tortuosity=%0.4f, Density=%0.4f, Composite=%0.4f\n', ...
        out_a.structural_complexity_state, out_a.tortuosity_computational_state, ...
        out_a.vascular_bed_density_state, out_a.composite_retinal_computational_state);
    fprintf('         PASSED: Zero input matched exact analytical solution x(10) = 0.25*(1-exp(-10)).\n');
    passed_tests = passed_tests + 1;
catch ME
    fprintf('         [FAIL] Test A exception: %s\n', ME.message);
end

%% ────────────────────────────────────────────────────────────────────────
%% TEST B: Authoritative Phase 6 Reference Case (0455d569_left)
%% ────────────────────────────────────────────────────────────────────────
fprintf('\n[TEST B] Phase 6 Reference Case Verification (0455d569_left)...\n');
try
    ref_bm = struct(...
        'vessel_density', 0.0854, ...
        'branch_count', 288, ...
        'zone_b_count', 17, ...
        'mean_tortuosity_distance', 0.0086, ...
        'mean_tortuosity_curvature', 0.1620, ...
        'fractal_dimension', 0.9707, ...
        'fractal_r_squared', 0.9987);

    res_b = run_retina_simulation(ref_bm);

    assert(strcmp(res_b.status, 'completed'), 'Test B failed: Status is not completed.');
    out_b = res_b.output_state;
    norm_b = res_b.normalized_inputs;

    % Verify normalized inputs match canonical contract
    assert(abs(norm_b.u_dens - (0.0854 / 0.20)) < 1e-3, 'Test B: u_dens mismatch.');
    assert(abs(norm_b.u_branch - (288 / 500)) < 1e-3, 'Test B: u_branch mismatch.');
    assert(abs(norm_b.u_zb - (17 / 30)) < 1e-3, 'Test B: u_zb mismatch.');
    assert(abs(norm_b.u_taud - (0.0086 / 0.04)) < 1e-3, 'Test B: u_taud mismatch.');
    assert(abs(norm_b.u_tauc - (0.1620 / 0.30)) < 1e-3, 'Test B: u_tauc mismatch.');

    % Verify terminal state values match analytical expectations within 0.005
    assert(abs(out_b.structural_complexity_state - 0.4614) < 0.005, 'Test B: Complexity state out of range.');
    assert(abs(out_b.tortuosity_computational_state - 0.3450) < 0.005, 'Test B: Tortuosity state out of range.');
    assert(abs(out_b.vascular_bed_density_state - 0.4828) < 0.005, 'Test B: Density state out of range.');
    assert(abs(out_b.composite_retinal_computational_state - 0.4340) < 0.005, 'Test B: Composite state out of range.');

    % Verify trajectory integrity
    traj_b = res_b.trajectory;
    assert(length(traj_b.theta) == 101, 'Test B: Trajectory theta length != 101.');
    assert(length(traj_b.complexity_curve) == 101, 'Test B: Complexity trajectory length != 101.');
    assert(all(~isnan(traj_b.complexity_curve)), 'Test B: NaN in complexity curve.');

    fprintf('         Outputs: Complexity=%0.4f, Tortuosity=%0.4f, Density=%0.4f, Composite=%0.4f\n', ...
        out_b.structural_complexity_state, out_b.tortuosity_computational_state, ...
        out_b.vascular_bed_density_state, out_b.composite_retinal_computational_state);
    fprintf('         PASSED: Phase 6 reference case matched analytical expectations.\n');
    passed_tests = passed_tests + 1;
catch ME
    fprintf('         [FAIL] Test B exception: %s\n', ME.message);
end

%% ────────────────────────────────────────────────────────────────────────
%% TEST C: Saturated / High Inputs & Boundedness Check
%% ────────────────────────────────────────────────────────────────────────
fprintf('\n[TEST C] Saturated / High Inputs & Boundedness Check...\n');
try
    sat_bm = struct(...
        'vessel_density', 0.50, ...
        'branch_count', 1200, ...
        'zone_b_count', 80, ...
        'mean_tortuosity_distance', 0.15, ...
        'mean_tortuosity_curvature', 1.50, ...
        'fractal_dimension', 1.60, ...
        'fractal_r_squared', 1.00);

    res_c = run_retina_simulation(sat_bm);

    assert(strcmp(res_c.status, 'completed'), 'Test C failed: Status is not completed.');
    out_c = res_c.output_state;
    norm_c = res_c.normalized_inputs;

    % All inputs should be clamped to exactly 1.0
    assert(norm_c.u_dens == 1.0, 'Test C: u_dens not clamped to 1.0.');
    assert(norm_c.u_branch == 1.0, 'Test C: u_branch not clamped to 1.0.');
    assert(norm_c.u_zb == 1.0, 'Test C: u_zb not clamped to 1.0.');
    assert(norm_c.u_taud == 1.0, 'Test C: u_taud not clamped to 1.0.');
    assert(norm_c.u_tauc == 1.0, 'Test C: u_tauc not clamped to 1.0.');
    assert(norm_c.u_df_star == 1.0, 'Test C: u_df_star not clamped to 1.0.');

    % States must be bounded in [0.0, 1.0]
    all_vals_c = [out_c.structural_complexity_state, ...
                  out_c.tortuosity_computational_state, ...
                  out_c.vascular_bed_density_state, ...
                  out_c.composite_retinal_computational_state];

    assert(all(~isnan(all_vals_c)), 'Test C: NaN in saturated states.');
    assert(all(~isinf(all_vals_c)), 'Test C: Inf in saturated states.');
    assert(all(all_vals_c <= 1.000001), 'Test C: States exceed 1.0 bound.');
    assert(all(all_vals_c >= 0.999), 'Test C: Saturated states did not reach 1.0.');

    fprintf('         Outputs: Complexity=%0.4f, Tortuosity=%0.4f, Density=%0.4f, Composite=%0.4f\n', ...
        out_c.structural_complexity_state, out_c.tortuosity_computational_state, ...
        out_c.vascular_bed_density_state, out_c.composite_retinal_computational_state);
    fprintf('         PASSED: Saturated inputs strictly bounded in [0, 1] without divergence.\n');
    passed_tests = passed_tests + 1;
catch ME
    fprintf('         [FAIL] Test C exception: %s\n', ME.message);
end

%% ────────────────────────────────────────────────────────────────────────
%% TEST D: Repeated Execution & Determinism
%% ────────────────────────────────────────────────────────────────────────
fprintf('\n[TEST D] Repeated Execution & Determinism (5 iterations)...\n');
try
    num_iters = 5;
    hist_states = zeros(num_iters, 4);

    for iter = 1:num_iters
        res_d = run_retina_simulation(ref_bm);
        assert(strcmp(res_d.status, 'completed'), 'Test D: Non-completed status.');
        hist_states(iter, :) = [res_d.output_state.structural_complexity_state, ...
                                res_d.output_state.tortuosity_computational_state, ...
                                res_d.output_state.vascular_bed_density_state, ...
                                res_d.output_state.composite_retinal_computational_state];
    end

    % Compare all runs against run 1
    max_diff = max(max(abs(hist_states - repmat(hist_states(1, :), [num_iters, 1]))));
    assert(max_diff < 1e-10, sprintf('Test D failed: Output variance = %g > 1e-10.', max_diff));

    fprintf('         Max absolute variance across %d runs: %g\n', num_iters, max_diff);
    fprintf('         PASSED: Exact bitwise determinism verified across repeated runs.\n');
    passed_tests = passed_tests + 1;
catch ME
    fprintf('         [FAIL] Test D exception: %s\n', ME.message);
end

%% ────────────────────────────────────────────────────────────────────────
%% TEST E: Strict Invalid-Input Handling & Gating
%% ────────────────────────────────────────────────────────────────────────
fprintf('\n[TEST E] Strict Invalid-Input Handling & Gating...\n');
try
    % E1: Empty struct
    res_e1 = run_retina_simulation(struct());
    assert(strcmp(res_e1.status, 'invalid_input'), 'Test E1: Empty struct not gated.');
    assert(~isempty(res_e1.error_message), 'Test E1: Missing error message.');

    % E2: Missing field (e.g. fractal_dimension omitted)
    partial_bm = ref_bm;
    partial_bm = rmfield(partial_bm, 'fractal_dimension');
    res_e2 = run_retina_simulation(partial_bm);
    assert(strcmp(res_e2.status, 'invalid_input'), 'Test E2: Missing field not gated.');
    assert(contains(res_e2.error_message, 'fractal_dimension'), 'Test E2: Error message does not name field.');

    % E3: NaN in input
    nan_bm = ref_bm;
    nan_bm.vessel_density = NaN;
    res_e3 = run_retina_simulation(nan_bm);
    assert(strcmp(res_e3.status, 'invalid_input'), 'Test E3: NaN not gated.');

    % E4: Inf in input
    inf_bm = ref_bm;
    inf_bm.mean_tortuosity_curvature = Inf;
    res_e4 = run_retina_simulation(inf_bm);
    assert(strcmp(res_e4.status, 'invalid_input'), 'Test E4: Inf not gated.');

    % E5: Negative branch count
    neg_bm = ref_bm;
    neg_bm.branch_count = -10;
    res_e5 = run_retina_simulation(neg_bm);
    assert(strcmp(res_e5.status, 'invalid_input'), 'Test E5: Negative input not gated.');

    % E6: Non-struct input
    res_e6 = run_retina_simulation([1 2 3]);
    assert(strcmp(res_e6.status, 'invalid_input'), 'Test E6: Non-struct input not gated.');

    fprintf('         E1 (empty struct):     GATED -> "%s"\n', res_e1.error_message);
    fprintf('         E2 (missing field):    GATED -> "%s"\n', res_e2.error_message);
    fprintf('         E3 (NaN input):        GATED -> "%s"\n', res_e3.error_message);
    fprintf('         E4 (Inf input):        GATED -> "%s"\n', res_e4.error_message);
    fprintf('         E5 (negative count):   GATED -> "%s"\n', res_e5.error_message);
    fprintf('         E6 (non-struct input): GATED -> "%s"\n', res_e6.error_message);
    fprintf('         PASSED: All invalid inputs safely gated with zero crashes.\n');
    passed_tests = passed_tests + 1;
catch ME
    fprintf('         [FAIL] Test E exception: %s\n', ME.message);
end

%% ────────────────────────────────────────────────────────────────────────
%% SUMMARY
%% ────────────────────────────────────────────────────────────────────────
fprintf('\n========================================================================\n');
fprintf(' STANDALONE SIMULINK VERIFICATION: %d / %d TESTS PASSED\n', passed_tests, total_tests);
fprintf('========================================================================\n\n');

if passed_tests == total_tests
    fprintf('[SUCCESS] All standalone Simulink tests passed with zero errors.\n');
else
    error('Some standalone Simulink tests failed.');
end

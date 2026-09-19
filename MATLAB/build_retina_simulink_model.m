function model_path = build_retina_simulink_model(target_dir)
% BUILD_RETINA_SIMULINK_MODEL Programmatically generates retina_computational_state.slx
%
% Part of RetinaAI Phase 7: Simulink Retinal Computational State-Space Modeling.
% Generates a clean, deterministic, version-controlled Simulink model.
%
% Syntax:
%   model_path = build_retina_simulink_model()
%   model_path = build_retina_simulink_model(target_dir)
%
% Inputs:
%   target_dir - Optional target directory (defaults to directory of this script)
%
% Outputs:
%   model_path - Full path to the generated .slx file

    if nargin < 1 || isempty(target_dir)
        target_dir = fileparts(mfilename('fullpath'));
    end

    mdl_name = 'retina_computational_state';
    model_path = fullfile(target_dir, [mdl_name, '.slx']);

    % Close existing if currently open in memory
    if bdIsLoaded(mdl_name)
        close_system(mdl_name, 0);
    end

    % Delete existing .slx file if it exists to build clean
    if exist(model_path, 'file') == 4 || exist(model_path, 'file') == 2
        delete(model_path);
    end

    % Create new empty system
    new_system(mdl_name);

    % Configure solver and logging parameters
    set_param(mdl_name, ...
        'SolverType', 'Fixed-step', ...
        'Solver', 'ode4', ...
        'FixedStep', '0.1', ...
        'StartTime', '0.0', ...
        'StopTime', '10.0', ...
        'SaveTime', 'on', ...
        'TimeSaveName', 'tout', ...
        'SaveOutput', 'on', ...
        'OutputSaveName', 'yout', ...
        'SaveFormat', 'Dataset', ...
        'SignalLogging', 'on', ...
        'SignalLoggingName', 'logsout');

    % Define state-space matrices
    % 3 Continuous states:
    %   x1: Structural Complexity State
    %   x2: Tortuosity Computational State
    %   x3: Vascular Bed Density State
    %
    % 6 Normalized inputs in [0, 1]:
    %   u1: Normalized Vessel Density (u_dens)
    %   u2: Normalized Branch Count (u_branch)
    %   u3: Normalized Zone-B Count (u_zb)
    %   u4: Normalized Distance Tortuosity (u_taud)
    %   u5: Normalized Curvature Tortuosity (u_tauc)
    %   u6: Normalized Reliability-Weighted Fractal Dimension (u_df_star)
    
    A_mat = [-1.0,  0.0,  0.0; ...
              0.0, -1.0,  0.0; ...
              0.0,  0.0, -1.0];

    B_mat = [0.0,  0.50, 0.0,  0.0,  0.0,  0.50; ...
             0.0,  0.0,  0.0,  0.60, 0.40, 0.0;  ...
             0.60, 0.0,  0.40, 0.0,  0.0,  0.0];

    C_mat = eye(3);
    D_mat = zeros(3, 6);

    % Add Inport Block (u_norm vector)
    inport_path = [mdl_name, '/u_norm'];
    add_block('simulink/Sources/In1', inport_path, ...
        'Position', [60, 100, 90, 120], ...
        'PortDimensions', '6', ...
        'SampleTime', '-1');

    % Add State-Space Block
    ss_path = [mdl_name, '/RetinalStateSpace'];
    add_block('simulink/Continuous/State-Space', ss_path, ...
        'Position', [170, 80, 270, 140], ...
        'A', mat2str(A_mat), ...
        'B', mat2str(B_mat), ...
        'C', mat2str(C_mat), ...
        'D', mat2str(D_mat), ...
        'X0', '[0; 0; 0]');

    % Add Saturation Block (Explicit Bounded Output Transformation)
    sat_path = [mdl_name, '/StateLimiter'];
    add_block('simulink/Discontinuities/Saturation', sat_path, ...
        'Position', [340, 90, 380, 130], ...
        'UpperLimit', '1.0', ...
        'LowerLimit', '0.0');

    % Add Outport Block (S_state)
    outport_path = [mdl_name, '/S_state'];
    add_block('simulink/Sinks/Out1', outport_path, ...
        'Position', [450, 100, 480, 120], ...
        'Port', '1');

    % Add Signal Lines
    add_line(mdl_name, 'u_norm/1', 'RetinalStateSpace/1');
    add_line(mdl_name, 'RetinalStateSpace/1', 'StateLimiter/1');
    add_line(mdl_name, 'StateLimiter/1', 'S_state/1');

    % Save and close model
    save_system(mdl_name, model_path);
    close_system(mdl_name);

    fprintf('[SUCCESS] Generated Simulink model: %s\n', model_path);
end

use std::env;
use zed_extension_api::{self as zed, ContextServerConfiguration, ContextServerId, Project, Result};

const PACKAGE_NAME: &str = "grasp-mcp-server";
const SERVER_PATH: &str = "node_modules/grasp-mcp-server/dist/index.js";

struct GraspExtension;

impl zed::Extension for GraspExtension {
    fn new() -> Self {
        GraspExtension
    }

    fn context_server_configuration(
        &mut self,
        _context_server_id: &ContextServerId,
        _project: &Project,
    ) -> Result<Option<ContextServerConfiguration>> {
        Ok(Some(ContextServerConfiguration {
            installation_instructions:
                "Grasp installs automatically as an npm package (`grasp-mcp-server`). \
                 No manual setup required — Zed will install and keep it up to date for you.\n\n\
                 For manual use outside Zed:\n\
                 ```\nnpm install -g grasp-mcp-server\n```"
                    .to_string(),
            default_settings: "{}".to_string(),
            settings_schema: "{}".to_string(),
        }))
    }
}

impl zed::ContextServerExtension for GraspExtension {
    fn context_server_command(
        &mut self,
        _context_server_id: &ContextServerId,
        _project: &Project,
    ) -> Result<zed::Command> {
        let latest_version = zed::npm_package_latest_version(PACKAGE_NAME)?;
        let installed = zed::npm_package_installed_version(PACKAGE_NAME)?;
        if installed.as_deref() != Some(latest_version.as_str()) {
            zed::npm_install_package(PACKAGE_NAME, &latest_version)?;
        }
        let node_path = zed::node_binary_path()?;
        let server_path = env::current_dir()
            .unwrap()
            .join(SERVER_PATH)
            .to_string_lossy()
            .to_string();
        Ok(zed::Command {
            command: node_path,
            args: vec![server_path],
            env: Default::default(),
        })
    }
}

zed::register_extension!(GraspExtension);

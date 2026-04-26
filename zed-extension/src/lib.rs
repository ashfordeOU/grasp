use zed_extension_api::{self as zed, ContextServerId, Project, Result};

struct GraspExtension;

impl zed::Extension for GraspExtension {
    fn new() -> Self {
        GraspExtension
    }
}

impl zed::ContextServerExtension for GraspExtension {
    fn context_server_command(
        &mut self,
        _context_server_id: &ContextServerId,
        _project: &Project,
    ) -> Result<zed::Command> {
        Ok(zed::Command {
            command: "npx".to_string(),
            args: vec!["grasp-mcp-server".to_string()],
            env: Default::default(),
        })
    }
}

zed::register_extension!(GraspExtension);

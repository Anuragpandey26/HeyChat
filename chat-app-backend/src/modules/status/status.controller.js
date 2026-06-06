import { StatusService } from './status.service.js';

const statusService = new StatusService();

export class StatusController {
  async createStatus(req, res, next) {
    try {
      const status = await statusService.createStatus(req.user.id, req.body, req.file);
      res.status(201).json({
        status: 'success',
        message: 'Status posted successfully',
        data: { status },
      });
    } catch (err) {
      next(err);
    }
  }

  async listStatuses(req, res, next) {
    try {
      const feed = await statusService.listStatuses(req.user.id);
      res.status(200).json({
        status: 'success',
        data: feed,
      });
    } catch (err) {
      next(err);
    }
  }

  async viewStatus(req, res, next) {
    try {
      const { statusId } = req.params;
      const { isLiked = false, emoji = null } = req.body;

      const view = await statusService.viewStatus(req.user.id, statusId, isLiked, emoji);
      res.status(200).json({
        status: 'success',
        message: 'Status marked as viewed',
        data: { view },
      });
    } catch (err) {
      next(err);
    }
  }

  async getViewers(req, res, next) {
    try {
      const { statusId } = req.params;
      const viewers = await statusService.getStatusViewerList(req.user.id, statusId);

      res.status(200).json({
        status: 'success',
        data: { viewers },
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteStatus(req, res, next) {
    try {
      const { statusId } = req.params;
      await statusService.deleteStatus(req.user.id, statusId);

      res.status(200).json({
        status: 'success',
        message: 'Status deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}

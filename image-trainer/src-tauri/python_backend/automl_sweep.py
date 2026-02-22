"""
AutoML Hyperparameter Sweep using Optuna
Standalone script that runs N mini-trials to find optimal hyperparameters.
Outputs JSON status lines to stdout for the EPOQ frontend.
"""
import sys
import json
import os
import argparse

import optuna
optuna.logging.set_verbosity(optuna.logging.WARNING)

import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms
from torch.utils.data import DataLoader, Subset


def emit(obj):
    """Print JSON to stdout for frontend consumption."""
    print(json.dumps(obj), flush=True)


def build_dataloaders(data_dir, batch_size, num_workers):
    """Build train/val DataLoaders reusing the same logic as script.py."""
    data_transforms = {
        'train': transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ]),
        'val': transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ]),
    }

    train_dir = os.path.join(data_dir, 'train')
    val_dir = os.path.join(data_dir, 'val')
    if not os.path.exists(val_dir) and os.path.exists(os.path.join(data_dir, 'validation')):
        val_dir = os.path.join(data_dir, 'validation')

    dataloaders = {}
    dataset_sizes = {}
    class_names = []

    if os.path.isdir(train_dir):
        train_dataset = datasets.ImageFolder(train_dir, data_transforms['train'])
        dataloaders['train'] = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=num_workers)
        dataset_sizes['train'] = len(train_dataset)
        class_names = train_dataset.classes

        if os.path.isdir(val_dir):
            val_dataset = datasets.ImageFolder(val_dir, data_transforms['val'])
            dataloaders['val'] = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=num_workers)
            dataset_sizes['val'] = len(val_dataset)
        else:
            dataloaders['val'] = None
            dataset_sizes['val'] = 0
    else:
        # Flat dataset — auto-split
        if not any(os.path.isdir(os.path.join(data_dir, i)) for i in os.listdir(data_dir)):
            return None, None, None, "Invalid dataset structure."

        from sklearn.model_selection import train_test_split

        dummy_dataset = datasets.ImageFolder(data_dir)
        class_names = dummy_dataset.classes
        total = len(dummy_dataset)
        if total == 0:
            return None, None, None, "No images found."

        train_len = int(0.8 * total)
        val_len = total - train_len

        targets = dummy_dataset.targets
        indices = list(range(total))

        try:
            train_idx, val_idx = train_test_split(
                indices, train_size=train_len, stratify=targets, random_state=42
            )
        except ValueError:
            from torch.utils.data import random_split
            subset_train, subset_val = random_split(dummy_dataset, [train_len, val_len])
            train_idx = subset_train.indices
            val_idx = subset_val.indices

        dataset_train = datasets.ImageFolder(data_dir, data_transforms['train'])
        dataset_val = datasets.ImageFolder(data_dir, data_transforms['val'])

        dataloaders['train'] = DataLoader(Subset(dataset_train, train_idx), batch_size=batch_size, shuffle=True, num_workers=num_workers)
        dataloaders['val'] = DataLoader(Subset(dataset_val, val_idx), batch_size=batch_size, shuffle=False, num_workers=num_workers)
        dataset_sizes['train'] = len(train_idx)
        dataset_sizes['val'] = len(val_idx)

    return dataloaders, dataset_sizes, class_names, None


def run_trial_training(model, dataloaders, dataset_sizes, device, optimizer, criterion, epochs):
    """Run a short training and return best validation accuracy."""
    best_acc = 0.0

    for epoch in range(epochs):
        for phase in ['train', 'val']:
            if dataset_sizes.get(phase, 0) == 0 or dataloaders.get(phase) is None:
                continue

            if phase == 'train':
                model.train()
            else:
                model.eval()

            running_loss = 0.0
            running_corrects = 0

            for inputs, labels in dataloaders[phase]:
                inputs = inputs.to(device)
                labels = labels.to(device)

                optimizer.zero_grad()
                with torch.set_grad_enabled(phase == 'train'):
                    outputs = model(inputs)
                    _, preds = torch.max(outputs, 1)
                    loss = criterion(outputs, labels)
                    if phase == 'train':
                        loss.backward()
                        optimizer.step()

                running_loss += loss.item() * inputs.size(0)
                running_corrects += torch.sum(preds == labels.data)

            if phase == 'val':
                epoch_acc = running_corrects.double() / dataset_sizes[phase]
                best_acc = max(best_acc, epoch_acc.item())

    return best_acc


def main():
    parser = argparse.ArgumentParser(description='EPOQ AutoML Hyperparameter Sweep')
    parser.add_argument('--path', type=str, required=True, help='Path to dataset')
    parser.add_argument('--model', type=str, default='resnet18',
                        choices=['resnet18', 'resnet50', 'efficientnet_b0', 'dcn', 'eva02',
                                 'mobilenet_v3', 'vit_b_16', 'convnext'],
                        help='Model architecture')
    parser.add_argument('--n_trials', type=int, default=10, help='Number of Optuna trials')
    parser.add_argument('--epochs_per_trial', type=int, default=3, help='Epochs per trial')
    parser.add_argument('--num_workers', type=int, default=-1, help='DataLoader workers (-1=auto)')
    args = parser.parse_args()

    if not os.path.exists(args.path):
        emit({"status": "error", "message": "Dataset directory not found."})
        return

    # Resolve num_workers
    if args.num_workers >= 0:
        num_workers = args.num_workers
    else:
        if sys.platform == 'win32':
            num_workers = 0  # Avoid Windows multiprocessing issues
        else:
            cpu_count = os.cpu_count() or 1
            num_workers = min(4, cpu_count)

    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

    emit({"status": "automl_started", "n_trials": args.n_trials, "device": str(device)})

    # Import model factory (same directory)
    import model_factory

    # We need to know the number of classes before creating trials
    # Quick peek at the dataset
    data_dir = args.path
    train_dir = os.path.join(data_dir, 'train')
    if os.path.isdir(train_dir):
        dummy = datasets.ImageFolder(train_dir)
    else:
        dummy = datasets.ImageFolder(data_dir)
    num_classes = len(dummy.classes)
    class_names = dummy.classes

    emit({"status": "automl_info", "message": f"Detected {num_classes} classes: {class_names}", "num_classes": num_classes})

    trial_results = []

    def objective(trial):
        # Suggest hyperparameters
        lr = trial.suggest_float("learning_rate", 1e-5, 1e-1, log=True)
        batch_size = trial.suggest_categorical("batch_size", [8, 16, 32, 64])
        optimizer_name = trial.suggest_categorical("optimizer", ["SGD", "Adam", "AdamW"])

        try:
            # Build dataloaders with this batch size
            dataloaders, dataset_sizes, _, err = build_dataloaders(data_dir, batch_size, num_workers)
            if err:
                emit({"status": "automl_trial_error", "trial": trial.number + 1, "n_trials": args.n_trials, "message": err})
                return 0.0

            # Create a fresh model for each trial
            model, params_to_optimize = model_factory.create_model(args.model, num_classes, device)

            # Create optimizer
            if optimizer_name == "SGD":
                opt = optim.SGD(params_to_optimize, lr=lr, momentum=0.9)
            elif optimizer_name == "Adam":
                opt = optim.Adam(params_to_optimize, lr=lr)
            else:  # AdamW
                opt = optim.AdamW(params_to_optimize, lr=lr)

            criterion = nn.CrossEntropyLoss()

            val_acc = run_trial_training(
                model, dataloaders, dataset_sizes, device, opt, criterion, args.epochs_per_trial
            )

            trial_info = {
                "status": "automl_trial",
                "trial": trial.number + 1,
                "n_trials": args.n_trials,
                "params": {
                    "learning_rate": lr,
                    "batch_size": batch_size,
                    "optimizer": optimizer_name
                },
                "val_accuracy": round(val_acc, 6)
            }
            emit(trial_info)
            trial_results.append(trial_info)

            # Cleanup to free GPU memory
            del model, opt, dataloaders
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            return val_acc

        except Exception as e:
            emit({
                "status": "automl_trial_error",
                "trial": trial.number + 1,
                "n_trials": args.n_trials,
                "message": str(e)
            })
            return 0.0

    # Run the study
    study = optuna.create_study(direction="maximize", study_name="epoq_automl")

    try:
        study.optimize(objective, n_trials=args.n_trials, show_progress_bar=False)
    except Exception as e:
        emit({"status": "error", "message": f"Optuna study failed: {str(e)}"})
        return

    # Report best result
    best = study.best_trial
    emit({
        "status": "automl_complete",
        "best_params": {
            "learning_rate": best.params["learning_rate"],
            "batch_size": best.params["batch_size"],
            "optimizer": best.params["optimizer"]
        },
        "best_accuracy": round(best.value, 6),
        "total_trials": len(study.trials),
        "trials": trial_results
    })


if __name__ == "__main__":
    main()
